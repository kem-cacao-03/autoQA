"""
Shared domain contracts.

Rules:
  - Only types consumed by MORE THAN ONE module live here.
  - No imports from any app.modules.* — must remain dependency-free.
"""

from typing import Any, Optional
from pydantic import BaseModel


class GenerationResult(BaseModel):
    """
    Canonical output of one completed AI generation.

    Pipeline mode  → provider = "pipeline"  (Gemini → GPT-4o → Claude)
    Research mode  → provider = model name  (one result per selected model)
    """

    test_suite_name: str
    description: str
    test_cases: list[Any] = []
    total_count: int
    provider: str
    mode: str
