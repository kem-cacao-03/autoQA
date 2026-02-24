"""
History module schemas.

Imports GenerationResult from core/schemas.py (shared contract),
NOT from generator/schema.py — that would create a cross-module dependency.
"""

from datetime import datetime
from pydantic import BaseModel

from app.core.schemas import GenerationResult


class HistoryItem(BaseModel):
    """Summary row returned in list endpoints."""

    id: str
    requirement: str
    provider: str
    test_type: str
    mode: str
    language: str
    total_count: int
    is_favorite: bool
    created_at: datetime


class HistoryDetail(HistoryItem):
    """Full detail including the generation result."""

    result: GenerationResult
