"""
MongoDB connection lifecycle using Motor (async driver).

Startup order (called from main.py lifespan):
  1. connect_db()      — open connection, ping server
  2. create_indexes()  — create/verify indexes (idempotent)

Shutdown:
  close_db()
"""

import logging

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: AsyncIOMotorClient | None = None


async def connect_db() -> None:
    """Open Motor client and verify connectivity with a ping."""
    global _client
    _client = AsyncIOMotorClient(settings.MONGODB_URL)
    await _client.admin.command("ping")
    logger.info("[DB] Connected → %s  db=%s", settings.MONGODB_URL, settings.MONGODB_DB)


async def create_indexes() -> None:
    """
    Create all collection indexes. Safe to call on every startup — idempotent.

    Collections & indexes:
      users   : unique email  (fast login lookup + duplicate prevention)
      history : user + date   (default list query)
               user + fav    (favorites filter)
    """
    db = get_database()

    # ── users ─────────────────────────────────────────────────────────────────
    await db["users"].create_index(
        [("email", ASCENDING)],
        unique=True,
        name="users_email_unique",
    )

    # ── history ───────────────────────────────────────────────────────────────
    await db["history"].create_index(
        [("user_id", ASCENDING), ("created_at", DESCENDING)],
        name="history_user_date",
    )
    await db["history"].create_index(
        [("user_id", ASCENDING), ("is_favorite", ASCENDING)],
        name="history_user_favorite",
    )

    logger.info("[DB] Indexes created / verified.")


async def close_db() -> None:
    """Close the Motor client on shutdown."""
    global _client
    if _client is not None:
        _client.close()
        _client = None
        logger.info("[DB] Connection closed.")


def get_database() -> AsyncIOMotorDatabase:
    if _client is None:
        raise RuntimeError("Database not initialised. Call connect_db() first.")
    return _client[settings.MONGODB_DB]
