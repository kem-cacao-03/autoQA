from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field


class AdminUserResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    img_url: Optional[str] = None
    role: str
    is_active: bool
    rate_limit: int
    rate_used: int
    rate_reset_at: Optional[datetime] = None
    created_at: datetime


class AdminUserListResponse(BaseModel):
    total: int
    items: list[AdminUserResponse] = Field(default_factory=list)


class AdminStats(BaseModel):
    total: int
    active: int
    locked: int
    admins: int


class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=2)
    role: Literal["user", "admin"] = "user"
    rate_limit: int = Field(default=0, ge=0)


class SetStatusRequest(BaseModel):
    is_active: bool


class SetRateLimitRequest(BaseModel):
    rate_limit: int = Field(ge=0)


class SetRoleRequest(BaseModel):
    role: Literal["user", "admin"]


class GlobalSettings(BaseModel):
    default_rate_limit: int = Field(default=0, ge=0)
    registration_open: bool = True
    rate_reset_hour: int = Field(default=0, ge=0, le=23)


class UpdateSettingsRequest(BaseModel):
    default_rate_limit: int = Field(ge=0)
    registration_open: bool = True
    rate_reset_hour: int = Field(default=0, ge=0, le=23)
