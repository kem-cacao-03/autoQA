"""
Generator router.

POST   /generate           → submits job, returns {job_id} immediately (202)
GET    /generate/jobs/{id} → polls job status and retrieves result when ready
DELETE /generate/jobs/{id} → cancels a running job

The POST endpoint accepts multipart/form-data so users can optionally attach
an image (screenshot, wireframe, diagram) alongside the text requirement.
"""

import json
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.dependencies import check_rate_limit, get_current_user, get_db
from app.modules.generator.schema import (
    GenerateRequest,
    GenerationMode,
    JobStatusResponse,
    JobSubmittedResponse,
    LLMProvider,
)
from app.modules.generator.service import GeneratorService

router = APIRouter(prefix="/generate", tags=["Generator"])

_MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
_ALLOWED_MIMES   = {"image/jpeg", "image/png", "image/gif", "image/webp"}


def _svc(db: AsyncIOMotorDatabase = Depends(get_db)) -> GeneratorService:
    return GeneratorService(db)


def _detect_mime(data: bytes) -> str:
    if data[:4] == b'\x89PNG':                         return "image/png"
    if data[:3] == b'\xff\xd8\xff':                    return "image/jpeg"
    if data[:6] in (b'GIF87a', b'GIF89a'):             return "image/gif"
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':  return "image/webp"
    return "application/octet-stream"


@router.post(
    "",
    response_model=JobSubmittedResponse,
    status_code=202,
    summary="Submit a generation job — returns Job ID immediately",
    dependencies=[Depends(check_rate_limit)],
)
async def submit(
    requirement: str = Form(default="", description="Feature/requirement description — text, image, or both must be provided"),
    mode: str      = Form(default="pipeline"),
    language: str  = Form(default="English"),
    providers: str = Form(
        default='["openai","gemini","claude"]',
        description='JSON array of providers, e.g. ["openai","gemini"]',
    ),
    image: Optional[UploadFile] = File(default=None, description="Optional screenshot or diagram (JPEG/PNG/GIF/WebP, max 10 MB)"),
    svc: GeneratorService = Depends(_svc),
    current_user: dict    = Depends(get_current_user),
):
    """
    **Pipeline mode** — GPT-4o (BA) → Gemini (QA) → Claude (Reviewer).
    Returns a single validated test suite.

    **Research mode** — calls selected providers in parallel.
    Returns one result per provider for side-by-side comparison.

    An optional image attachment (screenshot, wireframe, diagram) can be included
    to give the AI visual context during generation.

    Poll **GET /generate/jobs/{job_id}** to retrieve the result.
    """
    # ── Validate: must have at least text or image ────────────────────────────
    if not requirement.strip() and (not image or not image.filename):
        raise HTTPException(
            status_code=422,
            detail="Provide at least a text description or an image.",
        )

    # ── Parse and validate form fields ───────────────────────────────────────
    try:
        gen_mode = GenerationMode(mode)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid mode '{mode}'. Use 'pipeline' or 'research'.")

    try:
        provider_list = [LLMProvider(p) for p in json.loads(providers)]
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid providers value: {exc}")

    body = GenerateRequest(
        requirement=requirement,
        mode=gen_mode,
        language=language,
        providers=provider_list,
    )

    # ── Process optional image ────────────────────────────────────────────────
    image_bytes: bytes | None = None
    if image and image.filename:
        raw = await image.read()
        if len(raw) > _MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="Image exceeds the 10 MB limit.")
        if _detect_mime(raw) not in _ALLOWED_MIMES:
            raise HTTPException(
                status_code=415,
                detail="Unsupported image format. Use JPEG, PNG, GIF, or WebP.",
            )
        image_bytes = raw

    return svc.submit(body, user_id=current_user["_id"], image_bytes=image_bytes)


@router.get(
    "/jobs/{job_id}",
    response_model=JobStatusResponse,
    summary="Poll job status and retrieve result",
)
async def poll_job(job_id: str, _: dict = Depends(get_current_user)):
    """
    Job state transitions: `pending` → `running` → `success | failure | cancelled`

    - **Pipeline**: result in `result` field, `history_id` points to saved record.
    - **Research**: results in `research_results[]`, one entry per provider.
    """
    return GeneratorService.get_status(job_id)


@router.delete(
    "/jobs/{job_id}",
    status_code=200,
    summary="Cancel a running job",
)
async def cancel_job(job_id: str, _: dict = Depends(get_current_user)):
    """Cancel a pending or running job. No-op if already finished."""
    return GeneratorService.cancel(job_id)
