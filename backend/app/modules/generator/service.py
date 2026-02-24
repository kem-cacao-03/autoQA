"""
GeneratorService — orchestration layer between router and task engine.

Responsibilities:
  • Validate that required API keys are configured for the chosen mode.
  • Create the job record in the in-memory store.
  • Dispatch the correct async task (pipeline or research).
  • Expose job-status queries to the router.
"""

from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.modules.generator import tasks as task_engine
from app.modules.generator.schema import (
    GenerateRequest,
    GenerationMode,
    JobStatusResponse,
    JobSubmittedResponse,
    LLMProvider,
)

# Keys required per provider
_KEY_MAP: dict[str, str] = {
    LLMProvider.OPENAI.value:  "OPENAI_API_KEY",
    LLMProvider.GEMINI.value:  "GEMINI_API_KEY",
    LLMProvider.CLAUDE.value:  "ANTHROPIC_API_KEY",
}

_KEY_FN = {
    LLMProvider.OPENAI.value:  lambda: settings.OPENAI_API_KEY,
    LLMProvider.GEMINI.value:  lambda: settings.GEMINI_API_KEY,
    LLMProvider.CLAUDE.value:  lambda: settings.ANTHROPIC_API_KEY,
}


class GeneratorService:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._db = db

    # ── Submit ───────────────────────────────────────────────────────────────

    def submit(self, req: GenerateRequest, user_id: str) -> JobSubmittedResponse:
        """Validate API keys, create job, fire-and-forget the task."""
        if req.mode == GenerationMode.PIPELINE:
            # Pipeline always calls all three providers in sequence
            self._require_keys([LLMProvider.GEMINI, LLMProvider.OPENAI, LLMProvider.CLAUDE])
        else:
            # Research: only the user-selected providers are needed
            self._require_keys(req.providers)

        job_id = task_engine.create_job()
        task_engine.dispatch(job_id, req, user_id, self._db)
        return JobSubmittedResponse(job_id=job_id)

    # ── Poll ─────────────────────────────────────────────────────────────────

    @staticmethod
    def get_status(job_id: str) -> JobStatusResponse:
        job = task_engine.get_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found.")
        return JobStatusResponse(
            job_id=job.job_id,
            status=job.status,
            progress=job.progress,
            result=job.result,
            history_id=job.history_id,
            research_results=job.research_results,
            error=job.error,
            created_at=job.created_at,
        )

    # ── Internal ──────────────────────────────────────────────────────────────

    @staticmethod
    def _require_keys(providers: list[LLMProvider]) -> None:
        missing = [
            _KEY_MAP[p.value]
            for p in providers
            if not _KEY_FN[p.value]()
        ]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Missing API key(s): {', '.join(missing)}. "
                       "Set them in backend/.env and restart the server.",
            )
