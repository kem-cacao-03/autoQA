"""
FastAPI reusable dependencies.
"""

from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.security import decode_token
from app.db.database import get_database

_bearer = HTTPBearer(auto_error=True)


async def get_db() -> AsyncIOMotorDatabase:
    return get_database()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise credentials_exception
        user_id: str = payload.get("sub")
        if not user_id:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = await db["users"].find_one({"_id": user_id})
    if user is None:
        raise credentials_exception
    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is locked. Contact your administrator.",
        )
    return user


async def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return current_user


async def check_rate_limit(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> None:
    rate_limit: int = current_user.get("rate_limit", 0)
    if rate_limit == 0:
        return  # 0 = unlimited

    now = datetime.utcnow()
    user_id: str = current_user["_id"]
    col = db["users"]

    # Read configured reset hour from global settings
    settings_doc = await db["settings"].find_one({"_id": "global"})
    reset_hour: int = (settings_doc or {}).get("rate_reset_hour", 0)

    # Reset counter if the daily window has expired
    reset_at = current_user.get("rate_reset_at")
    if reset_at is None or (isinstance(reset_at, datetime) and reset_at < now):
        next_reset = (now + timedelta(days=1)).replace(
            hour=reset_hour, minute=0, second=0, microsecond=0
        )
        # If the next occurrence of reset_hour is still later today, use today's
        today_reset = now.replace(hour=reset_hour, minute=0, second=0, microsecond=0)
        if today_reset > now:
            next_reset = today_reset
        await col.update_one(
            {"_id": user_id},
            {"$set": {"rate_used": 0, "rate_reset_at": next_reset}},
        )

    # Atomically increment only if still under limit
    updated = await col.find_one_and_update(
        {"_id": user_id, "$expr": {"$lt": [{"$ifNull": ["$rate_used", 0]}, rate_limit]}},
        {"$inc": {"rate_used": 1}},
    )
    if updated is None:
        reset_label = f"{reset_hour:02d}:00 UTC"
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily request limit of {rate_limit} reached. Resets at {reset_label}.",
        )
