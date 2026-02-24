"""
Async task engine — job store + pipeline/research orchestration.

Single Responsibility:
  - _JOB_STORE  : in-memory job registry with TTL-based cleanup
  - run_pipeline : 3-stage sequential  (Gemini → GPT-4o → Claude)
  - run_research : N-model parallel    (selected providers simultaneously)
  - dispatch     : selects and schedules the correct coroutine

Prompt building  → prompts.py     (no prompt logic here)
LLM I/O          → llm_caller.py  (no HTTP logic here)
"""

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.schemas import GenerationResult, ReviewSummary
from app.modules.generator import llm_caller, prompts
from app.modules.generator.schema import (
    GenerateRequest,
    GenerationMode,
    JobStatus,
    LLMProvider,
    ResearchProviderResult,
    StageUsage,
)

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

def _make_stage_usage(stage: str, cr: llm_caller.CallResult, duration: float | None = None) -> StageUsage:
    return StageUsage(
        stage=stage,
        prompt_tokens=cr.prompt_tokens,
        completion_tokens=cr.completion_tokens,
        total_tokens=cr.total_tokens,
        duration_seconds=duration,
    )


def _build_result(
    raw: dict,
    provider: str,
    req: GenerateRequest,
) -> GenerationResult:
    items = raw.get("test_cases", []) or raw.get("scenarios", [])

    review_summary: ReviewSummary | None = None
    if rs := raw.get("review_summary"):
        review_summary = ReviewSummary(
            cases_reviewed=rs.get("cases_reviewed", 0),
            cases_added=rs.get("cases_added", 0),
            cases_modified=rs.get("cases_modified", 0),
            coverage_score=rs.get("coverage_score", "medium"),
        )

    return GenerationResult(
        test_suite_name=raw.get("test_suite_name", "Generated Suite"),
        description=raw.get("description", ""),
        test_cases=raw.get("test_cases", []),
        scenarios=raw.get("scenarios", []),
        total_count=raw.get("total_count", len(items)),
        provider=provider,
        test_type=req.test_type.value,
        mode=req.mode.value,
        review_summary=review_summary,
    )


async def _persist(
    result: GenerationResult,
    req: GenerateRequest,
    user_id: str,
    db: AsyncIOMotorDatabase,
) -> str:
    doc_id = str(uuid.uuid4())
    await db["history"].insert_one(
        {
            "_id": doc_id,
            "user_id": user_id,
            "requirement": req.requirement,
            "provider": result.provider,
            "test_type": req.test_type.value,
            "mode": req.mode.value,
            "language": req.language,
            "is_favorite": False,
            "result": result.model_dump(),
            "created_at": datetime.now(timezone.utc),
        }
    )
    return doc_id


# ── MODE A: Optimized Pipeline ────────────────────────────────────────────────
#   Stage 1: Gemini   as Senior Business Analyst → BA analysis text
#   Stage 2: GPT-4o   as Senior QA Engineer      → draft test cases JSON
#   Stage 3: Claude   as Elite Quality Auditor   → final validated test cases JSON

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
        # ── Stage 1: Gemini — Senior Business Analyst ─────────────────────────
        t_ba = datetime.now(timezone.utc)
        cr_ba = await llm_caller.call(
            provider="gemini",
            prompt=prompts.build_ba_prompt(req.requirement),
            system=prompts.SYSTEM_BA,
        )
        usage.append(_make_stage_usage("ba", cr_ba, (datetime.now(timezone.utc) - t_ba).total_seconds()))
        _update(job_id, progress=30)

        # ── Stage 2: GPT-4o — Senior QA Engineer ─────────────────────────────
        t_qa = datetime.now(timezone.utc)
        cr_qa = await llm_caller.call(
            provider="openai",
            prompt=prompts.build_qa_prompt(
                requirement=req.requirement,
                ba_spec=cr_ba.text,
                test_type=req.test_type.value,
                language=req.language,
            ),
            system=prompts.SYSTEM_QA,
        )
        usage.append(_make_stage_usage("qa", cr_qa, (datetime.now(timezone.utc) - t_qa).total_seconds()))
        _update(job_id, progress=65)

        # ── Stage 3: Claude — Elite Quality Auditor ──────────────────────────
        t_review = datetime.now(timezone.utc)
        cr_review = await llm_caller.call(
            provider="claude",
            prompt=prompts.build_review_prompt(
                ba_spec=cr_ba.text,
                qa_cases=cr_qa.text,
                language=req.language,
            ),
            system=prompts.SYSTEM_REVIEWER,
        )
        usage.append(_make_stage_usage("reviewer", cr_review, (datetime.now(timezone.utc) - t_review).total_seconds()))
        _update(job_id, progress=90)

        result = _build_result(
            llm_caller.parse_json(cr_review.text),
            provider="pipeline",
            req=req,
        )
        history_id = await _persist(result, req, user_id, db)
        elapsed = (datetime.now(timezone.utc) - t0).total_seconds()

        _update(
            job_id,
            status=JobStatus.SUCCESS,
            progress=100,
            result=result,
            history_id=history_id,
            elapsed_seconds=elapsed,
            usage=usage,
        )

    except Exception as exc:
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
                        test_type=req.test_type.value,
                        language=req.language,
                    ),
                    system=prompts.SYSTEM_RESEARCH,
                )
                duration = (datetime.now(timezone.utc) - t_start).total_seconds()
                result = _build_result(
                    llm_caller.parse_json(cr.text),
                    provider=provider.value,
                    req=req,
                )
                return ResearchProviderResult(
                    provider=provider.value,
                    result=result,
                    success=True,
                    usage=_make_stage_usage(provider.value, cr, duration),
                )
            except Exception as exc:
                return ResearchProviderResult(
                    provider=provider.value,
                    error=str(exc),
                    success=False,
                )

        # Fire all selected providers simultaneously
        research_results: list[ResearchProviderResult] = list(
            await asyncio.gather(*[_call_one(p) for p in providers])
        )

        # Persist each successful result to history so users can view later
        for r in research_results:
            if r.success and r.result is not None:
                await _persist(r.result, req, user_id, db)

        elapsed = (datetime.now(timezone.utc) - t0).total_seconds()
        # Aggregate usage across all providers
        agg_usage = [r.usage for r in research_results if r.usage is not None]

        _update(
            job_id,
            status=JobStatus.SUCCESS,
            progress=100,
            research_results=research_results,
            elapsed_seconds=elapsed,
            usage=agg_usage,
        )

    except Exception as exc:
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
    return asyncio.create_task(coro)
