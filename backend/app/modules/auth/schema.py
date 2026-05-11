from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=2)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    img_url: Optional[str] = None
    role: str = "user"
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UpdateProfileRequest(BaseModel):
    full_name: str = Field(min_length=2)
    img_url: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6)


class ResendOTPRequest(BaseModel):
    email: EmailStr


class ResetWithOTPRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=8)


# Internal DB document — never serialised directly to client
class UserInDB(BaseModel):
    id: str
    email: str
    full_name: str
    img_url: Optional[str] = None
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True
    role: Literal["user", "admin"] = "user"
    rate_limit: int = 0
    rate_used: int = 0
    rate_reset_at: Optional[datetime] = None
