from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.dependencies import get_db, require_admin
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
from app.modules.admin.service import AdminService

router = APIRouter(prefix="/admin", tags=["Admin"])


def _svc(db: AsyncIOMotorDatabase = Depends(get_db)) -> AdminService:
    return AdminService(db)


@router.get("/stats", response_model=AdminStats)
async def get_stats(
    admin: dict = Depends(require_admin),
    svc: AdminService = Depends(_svc),
):
    return await svc.get_stats()


@router.get("/users", response_model=AdminUserListResponse)
async def list_users(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    q: Optional[str] = Query(default=None),
    role: Optional[str] = Query(default=None),
    is_active: Optional[bool] = Query(default=None),
    admin: dict = Depends(require_admin),
    svc: AdminService = Depends(_svc),
):
    return await svc.list_users(skip=skip, limit=limit, q=q, role=role, is_active=is_active)


@router.post("/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: CreateUserRequest,
    admin: dict = Depends(require_admin),
    svc: AdminService = Depends(_svc),
):
    return await svc.create_user(body)


@router.patch("/users/{user_id}/status", response_model=AdminUserResponse)
async def set_status(
    user_id: str,
    body: SetStatusRequest,
    admin: dict = Depends(require_admin),
    svc: AdminService = Depends(_svc),
):
    return await svc.set_status(user_id, body, requesting_admin_id=admin["_id"])


@router.patch("/users/{user_id}/rate-limit", response_model=AdminUserResponse)
async def set_rate_limit(
    user_id: str,
    body: SetRateLimitRequest,
    admin: dict = Depends(require_admin),
    svc: AdminService = Depends(_svc),
):
    return await svc.set_rate_limit(user_id, body)


@router.patch("/users/{user_id}/role", response_model=AdminUserResponse)
async def set_role(
    user_id: str,
    body: SetRoleRequest,
    admin: dict = Depends(require_admin),
    svc: AdminService = Depends(_svc),
):
    return await svc.set_role(user_id, body, requesting_admin_id=admin["_id"])


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    admin: dict = Depends(require_admin),
    svc: AdminService = Depends(_svc),
):
    await svc.delete_user(user_id, requesting_admin_id=admin["_id"])


@router.get("/settings", response_model=GlobalSettings)
async def get_settings(
    admin: dict = Depends(require_admin),
    svc: AdminService = Depends(_svc),
):
    return await svc.get_settings()


@router.patch("/settings", response_model=GlobalSettings)
async def update_settings(
    body: UpdateSettingsRequest,
    admin: dict = Depends(require_admin),
    svc: AdminService = Depends(_svc),
):
    return await svc.update_settings(body)
