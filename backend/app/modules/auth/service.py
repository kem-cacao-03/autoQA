"""
AuthService — all business logic for user registration, login, and token refresh.
Interacts directly with the `users` MongoDB collection.
"""

import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import HTTPException, status
from jose import JWTError
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.email import send_reset_email, send_verification_email
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.modules.auth.schema import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    RefreshRequest,
    ResendOTPRequest,
    ResetWithOTPRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserLogin,
    UserRegister,
    UserResponse,
    VerifyOTPRequest,
)

COLLECTION = "users"


class AuthService:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db[COLLECTION]
        self._pending = db["pending_registrations"]
        self._db = db

    # ── Register ────────────────────────────────────────────────────────────

    @staticmethod
    def _generate_otp() -> str:
        return f"{secrets.randbelow(1000000):06d}"

    async def register(self, body: UserRegister) -> UserResponse:
        settings_doc = await self._db["settings"].find_one({"_id": "global"})
        if not (settings_doc or {}).get("registration_open", True):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Registration is currently closed.",
            )

        # Block if a verified account already exists
        existing = await self._col.find_one({"email": body.email})
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered.",
            )

        otp = self._generate_otp()
        now = datetime.utcnow()
        # Send email BEFORE writing anything — if SMTP fails, nothing is stored
        await send_verification_email(body.email, body.full_name, otp)

        # Upsert into pending_registrations (replaces any previous attempt for same email)
        await self._pending.update_one(
            {"_id": body.email},
            {"$set": {
                "full_name": body.full_name,
                "hashed_password": hash_password(body.password),
                "otp": otp,
                "otp_expires": now + timedelta(minutes=15),
                "created_at": now,
            }},
            upsert=True,
        )
        return UserResponse(
            id="",
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
        if not user.get("is_active", True):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is locked. Contact your administrator.",
            )
        # Existing users (created before email verification was added) are treated as verified.
        if not user.get("is_verified", True):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Email not verified. Please check your inbox.",
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
            role=user_doc.get("role", "user"),
            created_at=user_doc["created_at"],
        )

    # ── Update profile ────────────────────────────────────────────────────────

    async def update_profile(
        self, user_id: str, body: UpdateProfileRequest
    ) -> UserResponse:
        await self._col.update_one(
            {"_id": user_id},
            {"$set": {"full_name": body.full_name, "img_url": body.img_url}},
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

    # ── Verify OTP ────────────────────────────────────────────────────────────

    async def verify_otp(self, body: VerifyOTPRequest) -> None:
        now = datetime.utcnow()
        pending = await self._pending.find_one({"_id": body.email})
        if (
            not pending
            or pending.get("otp") != body.otp
            or not pending.get("otp_expires")
            or pending["otp_expires"] < now
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired OTP.",
            )

        settings_doc = await self._db["settings"].find_one({"_id": "global"})
        default_rate_limit: int = (settings_doc or {}).get("default_rate_limit", 0)

        user_id = str(uuid.uuid4())
        await self._col.insert_one({
            "_id": user_id,
            "email": body.email,
            "full_name": pending["full_name"],
            "hashed_password": pending["hashed_password"],
            "created_at": now,
            "is_active": True,
            "role": "user",
            "rate_limit": default_rate_limit,
            "rate_used": 0,
            "rate_reset_at": None,
        })
        await self._pending.delete_one({"_id": body.email})

    # ── Resend verification OTP ───────────────────────────────────────────────

    async def resend_otp(self, body: ResendOTPRequest) -> None:
        pending = await self._pending.find_one({"_id": body.email})
        if not pending:
            return  # silently succeed — don't reveal whether email is pending
        otp = self._generate_otp()
        now = datetime.utcnow()
        await self._pending.update_one(
            {"_id": body.email},
            {"$set": {
                "otp": otp,
                "otp_expires": now + timedelta(minutes=15),
                "created_at": now,  # reset TTL window
            }},
        )
        await send_verification_email(body.email, pending["full_name"], otp)

    # ── Forgot password ───────────────────────────────────────────────────────

    async def forgot_password(self, body: ForgotPasswordRequest) -> None:
        user = await self._col.find_one({"email": body.email})
        if not user:
            return  # silently succeed — don't reveal whether email exists
        otp = self._generate_otp()
        await self._col.update_one(
            {"_id": user["_id"]},
            {"$set": {
                "reset_otp": otp,
                "reset_otp_expires": datetime.utcnow() + timedelta(minutes=15),
            }},
        )
        await send_reset_email(user["email"], user["full_name"], otp)

    # ── Reset password with OTP ───────────────────────────────────────────────

    async def reset_password_otp(self, body: ResetWithOTPRequest) -> None:
        now = datetime.utcnow()
        user = await self._col.find_one({"email": body.email})
        if (
            not user
            or user.get("reset_otp") != body.otp
            or not user.get("reset_otp_expires")
            or user["reset_otp_expires"] < now
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired OTP.",
            )
        await self._col.update_one(
            {"_id": user["_id"]},
            {"$set": {"hashed_password": hash_password(body.new_password)},
             "$unset": {"reset_otp": "", "reset_otp_expires": ""}},
        )
