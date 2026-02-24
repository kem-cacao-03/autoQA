"""
FastAPI application factory.

Run:
    uvicorn app.main:app --reload --port 8000
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.database import close_db, connect_db, create_indexes
from app.modules.auth.router import router as auth_router
from app.modules.generator.router import router as generator_router
from app.modules.history.router import router as history_router

logger = logging.getLogger(__name__)


# ── Background cleanup task ───────────────────────────────────────────────────

async def _job_cleanup_loop() -> None:
    """Periodically remove expired jobs from the in-memory store (every 5 min)."""
    from app.modules.generator.tasks import cleanup_expired_jobs

    while True:
        try:
            await asyncio.sleep(300)
            removed = await cleanup_expired_jobs()
            if removed:
                logger.info("[JobStore] Removed %d expired job(s).", removed)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error("[JobStore] Cleanup failed: %s", exc, exc_info=True)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    await create_indexes()
    cleanup_task = asyncio.create_task(_job_cleanup_loop())
    try:
        yield
    finally:
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass
        await close_db()


# ── App factory ───────────────────────────────────────────────────────────────

app = FastAPI(
    title=settings.APP_TITLE,
    version=settings.APP_VERSION,
    description=(
        "**AutoQA Gen** — AI-powered test-case generation.\n\n"
        "**Pipeline mode**: Gemini (BA) → GPT-4o (QA Engineer) → Claude (Reviewer)\n\n"
        "**Research mode**: selected models run in parallel for comparison"
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(auth_router)
app.include_router(generator_router)
app.include_router(history_router)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["System"])
async def health():
    return {
        "status": "ok",
        "version": settings.APP_VERSION,
        "providers_configured": {
            "openai": bool(settings.OPENAI_API_KEY),
            "gemini": bool(settings.GEMINI_API_KEY),
            "claude": bool(settings.ANTHROPIC_API_KEY),
        },
    }
