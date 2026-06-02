"""
FastAPI application factory.

Run:
    uvicorn app.main:app --reload --port 8000
"""

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

# Configure app-namespace logging explicitly.
# logging.basicConfig() is a no-op if uvicorn has already added handlers to the
# root logger — so we attach directly to the "app" logger instead.
_app_log = logging.getLogger("app")
if not _app_log.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter(
        "%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
        datefmt="%H:%M:%S",
    ))
    _app_log.addHandler(_h)
_app_log.setLevel(logging.INFO)
_app_log.propagate = False  # avoid duplicates if root already has a handler

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.database import close_db, connect_db, create_indexes
from app.db.elastic import close_es, connect_es
from app.modules.admin.router import router as admin_router
from app.modules.auth.router import router as auth_router
from app.modules.generator.router import router as generator_router
from app.modules.history.router import router as history_router

logger = logging.getLogger(__name__)

# ── Performance logging middleware ────────────────────────────────────────────

_perf_log = logging.getLogger("app.perf")

class PerfMiddleware(BaseHTTPMiddleware):
    SLOW_MS = 2_000  # log WARNING if response takes longer than this

    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        ms = (time.perf_counter() - start) * 1000

        msg = f"{request.method} {request.url.path} → {response.status_code}  {ms:.0f}ms"
        if ms >= self.SLOW_MS:
            _perf_log.warning("SLOW  %s", msg)
        else:
            _perf_log.info(msg)

        response.headers["X-Response-Time"] = f"{ms:.0f}ms"
        return response


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


async def _rate_limit_reset_loop() -> None:
    """Every 60 s: reset rate_used for users whose rate_reset_at has expired."""
    from app.db.database import get_database

    while True:
        try:
            await asyncio.sleep(60)
            db = get_database()
            now = datetime.utcnow()

            settings_doc = await db["settings"].find_one({"_id": "global"})
            reset_hour: int = (settings_doc or {}).get("rate_reset_hour", 0)
            today_reset = now.replace(hour=reset_hour, minute=0, second=0, microsecond=0)
            next_reset = today_reset if today_reset > now else today_reset + timedelta(days=1)

            result = await db["users"].update_many(
                {"rate_limit": {"$gt": 0}, "rate_reset_at": {"$lt": now}},
                {"$set": {"rate_used": 0, "rate_reset_at": next_reset}},
            )
            if result.modified_count:
                logger.info(
                    "[RateReset] Auto-reset %d user(s). Next window at %s UTC.",
                    result.modified_count, next_reset.strftime("%Y-%m-%d %H:%M"),
                )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error("[RateReset] Auto-reset failed: %s", exc, exc_info=True)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    await create_indexes()
    await connect_es()
    cleanup_task = asyncio.create_task(_job_cleanup_loop())
    rate_reset_task = asyncio.create_task(_rate_limit_reset_loop())
    try:
        yield
    finally:
        cleanup_task.cancel()
        rate_reset_task.cancel()
        for t in (cleanup_task, rate_reset_task):
            try:
                await t
            except asyncio.CancelledError:
                pass
        await close_db()
        await close_es()


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
app.add_middleware(PerfMiddleware)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(auth_router)
app.include_router(generator_router)
app.include_router(history_router)
app.include_router(admin_router)


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
