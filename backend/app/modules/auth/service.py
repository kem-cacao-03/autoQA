"""
AuthService — all business logic for user registration, login, and token refresh.
Interacts directly with the `users` MongoDB collection.
"""

import uuid
from datetime import datetime

from fastapi import HTTPException, status
from jose import JWTError
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.modules.auth.schema import (
    ChangePasswordRequest,
    RefreshRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserLogin,
    UserRegister,
    UserResponse,
)

COLLECTION = "users"


class AuthService:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db[COLLECTION]

    # ── Register ────────────────────────────────────────────────────────────

    async def register(self, body: UserRegister) -> UserResponse:
        existing = await self._col.find_one({"email": body.email})
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered.",
            )

        user_id = str(uuid.uuid4())
        now = datetime.utcnow()
        await self._col.insert_one(
            {
                "_id": user_id,
                "email": body.email,
                "full_name": body.full_name,
                "hashed_password": hash_password(body.password),
                "created_at": now,
                "is_active": True,
            }
        )
        return UserResponse(
            id=user_id,
            email=body.email,
            full_name=body.full_name,
            created_at=now,
        )

    # ── Login ────────────────────────────────────────────────────────────────

    async def login(self, body: UserLogin) -> TokenResponse:
        user = await self._col.find_one({"email": body.email})
        if not user or not verify_password(body.password, user["hashed_password"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
            )
        return TokenResponse(
            access_token=create_access_token(user["_id"]),
            refresh_token=create_refresh_token(user["_id"]),
        )

    # ── Refresh ──────────────────────────────────────────────────────────────

    async def refresh(self, body: RefreshRequest) -> TokenResponse:
        try:
            payload = decode_token(body.refresh_token)
            if payload.get("type") != "refresh":
                raise ValueError
            user_id: str = payload["sub"]
        except (JWTError, ValueError):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token.",
            )

        user = await self._col.find_one({"_id": user_id})
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found.",
            )
        return TokenResponse(
            access_token=create_access_token(user_id),
            refresh_token=create_refresh_token(user_id),
        )

    # ── Me ───────────────────────────────────────────────────────────────────

    @staticmethod
    def to_response(user_doc: dict) -> UserResponse:
        return UserResponse(
            id=user_doc["_id"],
            email=user_doc["email"],
            full_name=user_doc["full_name"],
            img_url=user_doc.get("img_url"),
            created_at=user_doc["created_at"],
        )

    # ── Update profile ────────────────────────────────────────────────────────

    async def update_profile(
        self, user_id: str, body: UpdateProfileRequest
    ) -> UserResponse:
        # Ensure new email is not taken by another user
        conflict = await self._col.find_one(
            {"email": body.email, "_id": {"$ne": user_id}}
        )
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already in use by another account.",
            )
        await self._col.update_one(
            {"_id": user_id},
            {"$set": {"full_name": body.full_name, "email": body.email, "img_url": body.img_url}},
        )
        user = await self._col.find_one({"_id": user_id})
        return self.to_response(user)

    # ── Change password ───────────────────────────────────────────────────────

    async def change_password(
        self, user_id: str, body: ChangePasswordRequest
    ) -> None:
        user = await self._col.find_one({"_id": user_id})
        if not verify_password(body.current_password, user["hashed_password"]):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect.",
            )
        await self._col.update_one(
            {"_id": user_id},
            {"$set": {"hashed_password": hash_password(body.new_password)}},
        )
