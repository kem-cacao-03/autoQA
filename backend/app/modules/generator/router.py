"""
Generator router.

POST /generate           → submits job, returns {job_id} immediately (202)
GET  /generate/jobs/{id} → polls job status and retrieves result when ready
"""

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.dependencies import get_current_user, get_db
from app.modules.generator.schema import (
    GenerateRequest,
    JobStatusResponse,
    JobSubmittedResponse,
)
from app.modules.generator.service import GeneratorService

router = APIRouter(prefix="/generate", tags=["Generator"])


def _svc(db: AsyncIOMotorDatabase = Depends(get_db)) -> GeneratorService:
    return GeneratorService(db)


@router.post(
    "",
    response_model=JobSubmittedResponse,
    status_code=202,
    summary="Submit a generation job — returns Job ID immediately",
)
async def submit(                               # ← async: required for asyncio.create_task()
    body: GenerateRequest,
    svc: GeneratorService = Depends(_svc),
    current_user: dict = Depends(get_current_user),
):
    """
    **Pipeline mode** — Gemini (BA) → GPT-4o (QA) → Claude (Reviewer).
    Returns a single validated test suite.

    **Research mode** — calls selected providers in parallel.
    Returns one result per provider for side-by-side comparison.

    Poll **GET /generate/jobs/{job_id}** to retrieve the result.
    """
    return svc.submit(body, user_id=current_user["_id"])


@router.get(
    "/jobs/{job_id}",
    response_model=JobStatusResponse,
    summary="Poll job status and retrieve result",
)
async def poll_job(job_id: str, _: dict = Depends(get_current_user)):
    """
    Job state transitions: `pending` → `running` → `success | failure`

    - **Pipeline**: result in `result` field, `history_id` points to saved record.
    - **Research**: results in `research_results[]`, one entry per provider.
    """
    return GeneratorService.get_status(job_id)
