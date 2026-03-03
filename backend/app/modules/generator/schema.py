"""
Generator module schemas.

GenerationResult lives in app.core.schemas (shared contract).
This file defines only generator-specific types.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

from app.core.schemas import GenerationResult  # shared — not redefined here


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


__all__ = [
    "LLMProvider",
    "GenerationMode",
    "JobStatus",
    "GenerateRequest",
    "StageUsage",
    "ResearchProviderResult",
    "GenerationResult",        # re-exported for convenience
    "JobSubmittedResponse",
    "JobStatusResponse",
]


# ── Enums ─────────────────────────────────────────────────────────────────────

class LLMProvider(str, Enum):
    OPENAI = "openai"
    GEMINI = "gemini"
    CLAUDE = "claude"


class GenerationMode(str, Enum):
    PIPELINE = "pipeline"
    # Gemini (BA) → GPT-4o (QA Engineer) → Claude (Reviewer) — sequential, single output

    RESEARCH = "research"
    # Selected models run in PARALLEL — one independent result per model for comparison


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILURE = "failure"
    CANCELLED = "cancelled"


# ── Request ───────────────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    requirement: str = Field(
        min_length=10,
        description="Requirement, user story, or feature description.",
        examples=["As a user I want to log in with email and password."],
    )
    mode: GenerationMode = GenerationMode.PIPELINE
    language: str = "English"

    # Research mode only — which providers to compare (ignored in Pipeline mode)
    providers: list[LLMProvider] = Field(
        default_factory=lambda: [LLMProvider.OPENAI, LLMProvider.GEMINI, LLMProvider.CLAUDE],
        description="Providers to call in parallel (Research mode only).",
    )


# ── Token usage ───────────────────────────────────────────────────────────────

class StageUsage(BaseModel):
    """Token usage and timing for one LLM call (pipeline stage or research provider)."""
    stage: str           # e.g. "ba", "qa", "reviewer", or provider name in research
    provider: str        # actual provider used: "openai" | "gemini" | "claude"
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    duration_seconds: Optional[float] = None  # wall-clock time for this LLM call


# ── Research mode — per-provider result ──────────────────────────────────────

class ResearchProviderResult(BaseModel):
    """One model's independent output in Research mode."""

    provider: str
    result: Optional[GenerationResult] = None
    error: Optional[str] = None
    success: bool
    usage: Optional[StageUsage] = None


# ── Job lifecycle ─────────────────────────────────────────────────────────────

class JobSubmittedResponse(BaseModel):
    job_id: str
    status: JobStatus = JobStatus.PENDING
    message: str = "Job queued. Poll GET /generate/jobs/{job_id} for the result."


class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    progress: int = Field(default=0, ge=0, le=100)

    # Pipeline mode — single validated result
    result: Optional[GenerationResult] = None
    history_id: Optional[str] = None

    # Research mode — one entry per selected provider
    research_results: Optional[list[ResearchProviderResult]] = None

    # Observability
    elapsed_seconds: Optional[float] = None
    usage: Optional[list[StageUsage]] = None   # per-stage (pipeline) or per-provider (research)

    error: Optional[str] = None
    created_at: datetime = Field(default_factory=_utcnow)
