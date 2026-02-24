from fastapi import APIRouter, Depends, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.dependencies import get_current_user, get_db
from app.modules.auth.schema import (
    ChangePasswordRequest,
    RefreshRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserLogin,
    UserRegister,
    UserResponse,
)
from app.modules.auth.service import AuthService

router = APIRouter(prefix="/auth", tags=["Auth"])


def _svc(db: AsyncIOMotorDatabase = Depends(get_db)) -> AuthService:
    return AuthService(db)


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(body: UserRegister, svc: AuthService = Depends(_svc)):
    return await svc.register(body)


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin, svc: AuthService = Depends(_svc)):
    return await svc.login(body)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, svc: AuthService = Depends(_svc)):
    return await svc.refresh(body)


@router.get("/me", response_model=UserResponse)
async def me(current_user: dict = Depends(get_current_user)):
    return AuthService.to_response(current_user)


@router.put("/me", response_model=UserResponse)
async def update_profile(
    body: UpdateProfileRequest,
    current_user: dict = Depends(get_current_user),
    svc: AuthService = Depends(_svc),
):
    return await svc.update_profile(current_user["_id"], body)


@router.put("/me/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
    svc: AuthService = Depends(_svc),
):
    await svc.change_password(current_user["_id"], body)
