"""
History module schemas.

Imports GenerationResult from core/schemas.py (shared contract),
NOT from generator/schema.py — that would create a cross-module dependency.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from app.core.schemas import GenerationResult


class HistoryItem(BaseModel):
    """Summary row returned in list endpoints."""

    id: str
    requirement: str
    provider: str
    providers: list[str]          # all providers (pipeline: ["pipeline"]; research: all in session)
    session_id: Optional[str] = None   # research grouping key
    mode: str
    language: str
    total_count: int
    is_favorite: bool
    created_at: datetime
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    elapsed_seconds: Optional[float] = None


class HistoryDetail(HistoryItem):
    """Full detail including the generation result."""

    result: GenerationResult
    # Research mode: all providers' results grouped by session_id
    all_results: Optional[list[GenerationResult]] = None
    # Research mode: per-provider token + timing stats { provider: {total_tokens, elapsed_seconds} }
    provider_stats: Optional[dict[str, dict]] = None
