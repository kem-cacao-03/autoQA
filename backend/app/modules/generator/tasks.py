"""
Async task engine — job store + pipeline/research orchestration.

Single Responsibility:
  - _JOB_STORE  : in-memory job registry with TTL-based cleanup
  - run_pipeline : 3-stage sequential  (GPT-4o → Gemini → Claude)
  - run_research : N-model parallel    (selected providers simultaneously)
  - dispatch     : selects and schedules the correct coroutine

Prompt building  → prompts.py     (no prompt logic here)
LLM I/O          → llm_caller.py  (no HTTP logic here)
"""

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.schemas import GenerationResult
from app.modules.generator import llm_caller, prompts
from app.modules.generator.schema import (
    GenerateRequest,
    GenerationMode,
    JobStatus,
    LLMProvider,
    ResearchProviderResult,
    StageUsage,
)

logger = logging.getLogger(__name__)

# ── Job store ─────────────────────────────────────────────────────────────────

JOB_TTL_SECONDS: int = 3600  # 1 hour


@dataclass
class JobState:
    job_id: str
    status: JobStatus = JobStatus.PENDING
    progress: int = 0
    # Pipeline output
    result: GenerationResult | None = None
    history_id: str | None = None
    # Research output (one per selected provider)
    research_results: list[ResearchProviderResult] | None = None
    # Observability
    elapsed_seconds: float | None = None
    usage: list[StageUsage] | None = None
    error: str | None = None
    created_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    _started_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


_JOB_STORE: dict[str, JobState] = {}
_TASK_STORE: dict[str, asyncio.Task] = {}  # job_id → running asyncio Task


def create_job() -> str:
    job_id = str(uuid.uuid4())
    _JOB_STORE[job_id] = JobState(job_id=job_id)
    return job_id


def get_job(job_id: str) -> JobState | None:
    return _JOB_STORE.get(job_id)


def _update(job_id: str, **kwargs: Any) -> None:
    job = _JOB_STORE.get(job_id)
    if job:
        for k, v in kwargs.items():
            setattr(job, k, v)


def cancel_job(job_id: str) -> bool:
    """Cancel a running job by cancelling its asyncio Task.
    Returns True if the task was found and cancelled, False otherwise.
    """
    task = _TASK_STORE.get(job_id)
    if task and not task.done():
        task.cancel()
        return True
    return False


async def cleanup_expired_jobs() -> int:
    """Remove jobs older than JOB_TTL_SECONDS. Returns count removed."""
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=JOB_TTL_SECONDS)
    expired = [
        jid for jid, job in list(_JOB_STORE.items())
        if job.created_at < cutoff
    ]
    for jid in expired:
        _JOB_STORE.pop(jid, None)
    return len(expired)


# ── Shared helpers ────────────────────────────────────────────────────────────

def _make_stage_usage(stage: str, provider: str, cr: llm_caller.CallResult, duration: float | None = None) -> StageUsage:
    return StageUsage(
        stage=stage,
        provider=provider,
        prompt_tokens=cr.prompt_tokens,
        completion_tokens=cr.completion_tokens,
        total_tokens=cr.total_tokens,
        duration_seconds=duration,
    )


async def _log_usage(
    db: AsyncIOMotorDatabase,
    user_id: str,
    mode: str,
    stages: list[StageUsage],
    elapsed_seconds: float,
    history_id: str | None = None,
    session_id: str | None = None,
) -> None:
    """Insert one ai_log document recording per-stage token usage for a request."""
    total_in  = sum(s.prompt_tokens     for s in stages)
    total_out = sum(s.completion_tokens for s in stages)
    await db["ai_log"].insert_one({
        "_id":          str(uuid.uuid4()),
        "history_id":   history_id,
        "session_id":   session_id,
        "user_id":      user_id,
        "mode":         mode,
        "stages": [
            {
                "stage":            s.stage,
                "provider":         s.provider,
                "input_tokens":     s.prompt_tokens,
                "output_tokens":    s.completion_tokens,
                "total_tokens":     s.total_tokens,
                "duration_seconds": s.duration_seconds,
            }
            for s in stages
        ],
        "total_input_tokens":  total_in,
        "total_output_tokens": total_out,
        "total_tokens":        total_in + total_out,
        "elapsed_seconds":     elapsed_seconds,
        "created_at":          datetime.now(timezone.utc),
    })


def _build_result(
    raw: dict | list,
    provider: str,
    req: GenerateRequest,
) -> GenerationResult:
    # Guard: some models return a bare list of test cases instead of the full schema object.
    if isinstance(raw, list):
        raw = {"test_cases": raw, "total_count": len(raw)}
    items = raw.get("test_cases", [])

    return GenerationResult(
        test_suite_name=raw.get("test_suite_name", "Generated Suite"),
        description=raw.get("description", ""),
        test_cases=items,
        total_count=raw.get("total_count", len(items)),
        provider=provider,
        mode=req.mode.value,
    )


async def _persist(
    result: GenerationResult,
    req: GenerateRequest,
    user_id: str,
    db: AsyncIOMotorDatabase,
    session_id: str | None = None,
    input_tokens: int = 0,
    output_tokens: int = 0,
    elapsed_seconds: float | None = None,
) -> str:
    doc_id = str(uuid.uuid4())
    await db["history"].insert_one(
        {
            "_id": doc_id,
            "user_id": user_id,
            "requirement": req.requirement,
            "provider": result.provider,
            "mode": req.mode.value,
            "language": req.language,
            "is_favorite": False,
            "session_id": session_id,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
            "elapsed_seconds": elapsed_seconds,
            "result": result.model_dump(),
            "created_at": datetime.now(timezone.utc),
        }
    )
    return doc_id


# ── MODE A: Optimized Pipeline ────────────────────────────────────────────────
#   Stage 1: GPT-4o   as Senior Business Analyst / QA Architect → feature analysis JSON
#   Stage 2: Gemini   as Expert QA Engineer      → raw test suite JSON
#   Stage 3: Claude   as Senior QA Lead          → final validated test cases JSON

async def run_pipeline(
    job_id: str,
    req: GenerateRequest,
    user_id: str,
    db: AsyncIOMotorDatabase,
) -> None:
    t0 = datetime.now(timezone.utc)
    _update(job_id, status=JobStatus.RUNNING, progress=5)
    usage: list[StageUsage] = []
    try:
        # ── Stage 1: GPT-4o — Senior Business Analyst / QA Architect ──────────
        t_ba = datetime.now(timezone.utc)
        cr_ba = await llm_caller.call(
            provider="openai",
            prompt=prompts.build_ba_prompt(req.requirement, req.language),
            system=prompts.SYSTEM_BA,
        )
        dur_ba = (datetime.now(timezone.utc) - t_ba).total_seconds()
        usage.append(_make_stage_usage("ba", "openai", cr_ba, dur_ba))
        logger.info(
            "[PIPELINE] Stage 1 GPT-4o  (BA):       input=%6d  output=%5d  total=%6d  (%.1fs)",
            cr_ba.prompt_tokens, cr_ba.completion_tokens, cr_ba.total_tokens, dur_ba,
        )
        _update(job_id, progress=30)

        # Strip any markdown fences the model may have added despite instructions
        ba_spec_text = llm_caller.strip_fences(cr_ba.text)

        # ── Stage 2: Gemini — Expert QA Engineer ─────────────────────────────
        t_qa = datetime.now(timezone.utc)
        cr_qa = await llm_caller.call(
            provider="gemini",
            prompt=prompts.build_qa_prompt(
                ba_spec=ba_spec_text,
                language=req.language,
            ),
            system=prompts.SYSTEM_QA,
        )
        dur_qa = (datetime.now(timezone.utc) - t_qa).total_seconds()
        usage.append(_make_stage_usage("qa", "gemini", cr_qa, dur_qa))
        logger.info(
            "[PIPELINE] Stage 2 Gemini  (QA):       input=%6d  output=%5d  total=%6d  (%.1fs)",
            cr_qa.prompt_tokens, cr_qa.completion_tokens, cr_qa.total_tokens, dur_qa,
        )
        _update(job_id, progress=65)

        # ── Stage 3: Claude — Senior QA Lead / Final Review (GPT-4o fallback) ─
        t_review = datetime.now(timezone.utc)
        reviewer_prompt = prompts.build_review_prompt(
            requirement=req.requirement,
            qa_cases=llm_caller.strip_fences(cr_qa.text),
            language=req.language,
        )
        try:
            cr_review = await llm_caller.call(
                provider="claude",
                prompt=reviewer_prompt,
                system=prompts.SYSTEM_REVIEWER,
            )
            reviewer_provider, reviewer_label = "claude", "Claude"
        except Exception:
            # Claude unavailable after retries — fall back to GPT-4o as reviewer
            cr_review = await llm_caller.call(
                provider="openai",
                prompt=reviewer_prompt,
                system=prompts.SYSTEM_REVIEWER,
            )
            reviewer_provider, reviewer_label = "openai", "GPT-4o (fallback)"
        dur_review = (datetime.now(timezone.utc) - t_review).total_seconds()
        usage.append(_make_stage_usage("reviewer", reviewer_provider, cr_review, dur_review))
        logger.info(
            "[PIPELINE] Stage 3 %-18s input=%6d  output=%5d  total=%6d  (%.1fs)",
            f"{reviewer_label} (Rev):", cr_review.prompt_tokens, cr_review.completion_tokens,
            cr_review.total_tokens, dur_review,
        )
        _update(job_id, progress=90)

        result = _build_result(
            llm_caller.parse_json(cr_review.text),
            provider="pipeline",
            req=req,
        )
        elapsed = (datetime.now(timezone.utc) - t0).total_seconds()
        total_in  = sum(u.prompt_tokens for u in usage)
        total_out = sum(u.completion_tokens for u in usage)
        logger.info(
            "[PIPELINE] ─── TOTAL ───────────────────  input=%6d  output=%5d  total=%6d  (%.1fs elapsed)",
            total_in, total_out, total_in + total_out, elapsed,
        )
        history_id = await _persist(
            result, req, user_id, db,
            input_tokens=total_in,
            output_tokens=total_out,
            elapsed_seconds=elapsed,
        )
        await _log_usage(
            db=db, user_id=user_id, mode=req.mode.value,
            stages=usage, elapsed_seconds=elapsed, history_id=history_id,
        )

        _update(
            job_id,
            status=JobStatus.SUCCESS,
            progress=100,
            result=result,
            history_id=history_id,
            elapsed_seconds=elapsed,
            usage=usage,
        )

    except asyncio.CancelledError:
        _update(job_id, status=JobStatus.CANCELLED, error="Cancelled by user")
        raise

    except Exception as exc:
        logger.error("[PIPELINE] FAILED: %s", exc, exc_info=True)
        _update(job_id, status=JobStatus.FAILURE, error=str(exc))


# ── MODE B: Research — parallel model comparison ──────────────────────────────

async def run_research(
    job_id: str,
    req: GenerateRequest,
    user_id: str,
    db: AsyncIOMotorDatabase,
) -> None:
    t0 = datetime.now(timezone.utc)
    _update(job_id, status=JobStatus.RUNNING, progress=5)
    try:
        providers: list[LLMProvider] = req.providers or list(LLMProvider)

        async def _call_one(provider: LLMProvider) -> ResearchProviderResult:
            try:
                t_start = datetime.now(timezone.utc)
                cr = await llm_caller.call(
                    provider=provider.value,
                    prompt=prompts.build_research_prompt(
                        requirement=req.requirement,
                        language=req.language,
                    ),
                    system=prompts.SYSTEM_RESEARCH,
                )
                duration = (datetime.now(timezone.utc) - t_start).total_seconds()
                logger.info(
                    "[RESEARCH]  %-8s input=%6d  output=%5d  total=%6d  (%.1fs)",
                    provider.value, cr.prompt_tokens, cr.completion_tokens, cr.total_tokens, duration,
                )
                result = _build_result(
                    llm_caller.parse_json(cr.text),
                    provider=provider.value,
                    req=req,
                )
                return ResearchProviderResult(
                    provider=provider.value,
                    result=result,
                    success=True,
                    usage=_make_stage_usage(provider.value, provider.value, cr, duration),
                )
            except Exception as exc:
                logger.warning("[RESEARCH]  %s FAILED: %s", provider.value, exc)
                return ResearchProviderResult(
                    provider=provider.value,
                    error=str(exc),
                    success=False,
                )

        # Fire all selected providers simultaneously
        research_results: list[ResearchProviderResult] = list(
            await asyncio.gather(*[_call_one(p) for p in providers])
        )

        # Persist each successful result to history — all share a session_id
        # so the detail view can retrieve all providers together.
        research_session_id = str(uuid.uuid4())
        for r in research_results:
            if r.success and r.result is not None:
                await _persist(
                    r.result, req, user_id, db,
                    session_id=research_session_id,
                    input_tokens=r.usage.prompt_tokens if r.usage else 0,
                    output_tokens=r.usage.completion_tokens if r.usage else 0,
                    elapsed_seconds=r.usage.duration_seconds if r.usage else None,
                )

        elapsed = (datetime.now(timezone.utc) - t0).total_seconds()
        ok_results = [r for r in research_results if r.success and r.usage]
        if ok_results:
            logger.info(
                "[RESEARCH]  ─── TOTAL (wall) ────────────────────────────────────── (%.1fs elapsed)",
                elapsed,
            )
        # Aggregate usage across all providers
        agg_usage = [r.usage for r in research_results if r.usage is not None]
        await _log_usage(
            db=db, user_id=user_id, mode=req.mode.value,
            stages=agg_usage, elapsed_seconds=elapsed, session_id=research_session_id,
        )

        _update(
            job_id,
            status=JobStatus.SUCCESS,
            progress=100,
            research_results=research_results,
            elapsed_seconds=elapsed,
            usage=agg_usage,
        )

    except asyncio.CancelledError:
        _update(job_id, status=JobStatus.CANCELLED, error="Cancelled by user")
        raise

    except Exception as exc:
        logger.error("[RESEARCH] FAILED: %s", exc, exc_info=True)
        _update(job_id, status=JobStatus.FAILURE, error=str(exc))


# ── Dispatcher ────────────────────────────────────────────────────────────────

def dispatch(
    job_id: str,
    req: GenerateRequest,
    user_id: str,
    db: AsyncIOMotorDatabase,
) -> asyncio.Task:
    """
    Schedule the correct coroutine.
    Must be called from within an async context (event loop must be running).
    """
    coro = (
        run_research(job_id, req, user_id, db)
        if req.mode == GenerationMode.RESEARCH
        else run_pipeline(job_id, req, user_id, db)
    )
    task = asyncio.create_task(coro)
    _TASK_STORE[job_id] = task
    task.add_done_callback(lambda _: _TASK_STORE.pop(job_id, None))
    return task
