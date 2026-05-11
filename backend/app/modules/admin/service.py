"""
AdminService — CRUD operations on the users collection, accessible only to admins.
"""

import uuid
from datetime import datetime
from typing import Optional

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.security import hash_password
from app.modules.admin.schema import (
    AdminStats,
    AdminUserListResponse,
    AdminUserResponse,
    CreateUserRequest,
    GlobalSettings,
    SetRateLimitRequest,
    SetRoleRequest,
    SetStatusRequest,
    UpdateSettingsRequest,
)

COLLECTION = "users"
SETTINGS_COLLECTION = "settings"
SETTINGS_ID = "global"


class AdminService:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db[COLLECTION]
        self._settings = db[SETTINGS_COLLECTION]

    # ── Helpers ──────────────────────────────────────────────────────────────

    @staticmethod
    def _to_response(doc: dict) -> AdminUserResponse:
        return AdminUserResponse(
            id=doc["_id"],
            email=doc["email"],
            full_name=doc["full_name"],
            img_url=doc.get("img_url"),
            role=doc.get("role", "user"),
            is_active=doc.get("is_active", True),
            rate_limit=doc.get("rate_limit", 0),
            rate_used=doc.get("rate_used", 0),
            rate_reset_at=doc.get("rate_reset_at"),
            created_at=doc["created_at"],
        )

    async def _get_or_404(self, user_id: str) -> dict:
        doc = await self._col.find_one({"_id": user_id})
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
        return doc

    # ── Stats ─────────────────────────────────────────────────────────────────

    async def get_stats(self) -> AdminStats:
        total = await self._col.count_documents({})
        active = await self._col.count_documents({"is_active": True})
        locked = await self._col.count_documents({"is_active": False})
        admins = await self._col.count_documents({"role": "admin"})
        return AdminStats(total=total, active=active, locked=locked, admins=admins)

    # ── List ─────────────────────────────────────────────────────────────────

    async def list_users(
        self,
        skip: int = 0,
        limit: int = 20,
        q: Optional[str] = None,
        role: Optional[str] = None,
        is_active: Optional[bool] = None,
    ) -> AdminUserListResponse:
        query: dict = {}
        if q:
            query["$or"] = [
                {"full_name": {"$regex": q, "$options": "i"}},
                {"email": {"$regex": q, "$options": "i"}},
            ]
        if role:
            query["role"] = role
        if is_active is not None:
            query["is_active"] = is_active

        total = await self._col.count_documents(query)
        cursor = self._col.find(query).sort("created_at", -1).skip(skip).limit(limit)
        docs = await cursor.to_list(length=limit)
        return AdminUserListResponse(
            total=total,
            items=[self._to_response(d) for d in docs],
        )

    # ── Create ───────────────────────────────────────────────────────────────

    async def create_user(self, body: CreateUserRequest) -> AdminUserResponse:
        existing = await self._col.find_one({"email": body.email})
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered.",
            )
        user_id = str(uuid.uuid4())
        now = datetime.utcnow()
        doc = {
            "_id": user_id,
            "email": body.email,
            "full_name": body.full_name,
            "hashed_password": hash_password(body.password),
            "created_at": now,
            "is_active": True,
            "role": body.role,
            "rate_limit": body.rate_limit,
            "rate_used": 0,
            "rate_reset_at": None,
        }
        await self._col.insert_one(doc)
        return self._to_response(doc)

    # ── Set status (lock / unlock) ────────────────────────────────────────────

    async def set_status(
        self, user_id: str, body: SetStatusRequest, requesting_admin_id: str
    ) -> AdminUserResponse:
        if user_id == requesting_admin_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot change your own account status.",
            )
        await self._get_or_404(user_id)
        await self._col.update_one(
            {"_id": user_id},
            {"$set": {"is_active": body.is_active}},
        )
        return self._to_response(await self._col.find_one({"_id": user_id}))

    # ── Set rate limit ────────────────────────────────────────────────────────

    async def set_rate_limit(self, user_id: str, body: SetRateLimitRequest) -> AdminUserResponse:
        await self._get_or_404(user_id)
        await self._col.update_one(
            {"_id": user_id},
            {"$set": {"rate_limit": body.rate_limit, "rate_used": 0, "rate_reset_at": None}},
        )
        return self._to_response(await self._col.find_one({"_id": user_id}))

    # ── Set role ──────────────────────────────────────────────────────────────

    async def set_role(
        self, user_id: str, body: SetRoleRequest, requesting_admin_id: str
    ) -> AdminUserResponse:
        if user_id == requesting_admin_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot change your own role.",
            )
        await self._get_or_404(user_id)
        await self._col.update_one({"_id": user_id}, {"$set": {"role": body.role}})
        return self._to_response(await self._col.find_one({"_id": user_id}))

    # ── Global settings ───────────────────────────────────────────────────────

    async def get_settings(self) -> GlobalSettings:
        doc = await self._settings.find_one({"_id": SETTINGS_ID})
        if not doc:
            return GlobalSettings()
        return GlobalSettings(
            default_rate_limit=doc.get("default_rate_limit", 0),
            registration_open=doc.get("registration_open", True),
        )

    async def update_settings(self, body: UpdateSettingsRequest) -> GlobalSettings:
        await self._settings.update_one(
            {"_id": SETTINGS_ID},
            {"$set": {
                "default_rate_limit": body.default_rate_limit,
                "registration_open": body.registration_open,
            }},
            upsert=True,
        )
        return GlobalSettings(
            default_rate_limit=body.default_rate_limit,
            registration_open=body.registration_open,
        )

    # ── Delete ────────────────────────────────────────────────────────────────

    async def delete_user(self, user_id: str, requesting_admin_id: str) -> None:
        if user_id == requesting_admin_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete your own account.",
            )
        result = await self._col.delete_one({"_id": user_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
