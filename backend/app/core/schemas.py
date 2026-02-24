"""
Shared domain contracts.

Rules:
  - Only types consumed by MORE THAN ONE module live here.
  - No imports from any app.modules.* — must remain dependency-free.
"""

from typing import Any, Optional
from pydantic import BaseModel


class ReviewSummary(BaseModel):
    """Metadata produced by Claude's review stage (Pipeline mode only)."""

    cases_reviewed: int = 0
    cases_added: int = 0
    cases_modified: int = 0
    coverage_score: str = "medium"   # "high" | "medium" | "low"


class GenerationResult(BaseModel):
    """
    Canonical output of one completed AI generation.

    Pipeline mode  → provider = "pipeline"  (Gemini → GPT-4o → Claude)
    Research mode  → provider = model name  (one result per selected model)
    """

    test_suite_name: str
    description: str
    test_cases: list[Any] = []
    scenarios: list[Any] = []
    total_count: int
    provider: str
    test_type: str
    mode: str
    review_summary: Optional[ReviewSummary] = None  # populated in Pipeline mode
