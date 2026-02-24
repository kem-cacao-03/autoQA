"""
History router.

GET    /history                  → list (paginated, filterable by favourite)
GET    /history/{id}             → full detail with GenerationResult
DELETE /history/{id}             → delete one entry
POST   /history/{id}/favorite    → toggle favourite flag
"""

from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.dependencies import get_current_user, get_db
from app.modules.history.schema import HistoryDetail, HistoryItem
from app.modules.history.service import HistoryService

router = APIRouter(prefix="/history", tags=["History"])


def _svc(db: AsyncIOMotorDatabase = Depends(get_db)) -> HistoryService:
    return HistoryService(db)


@router.get("", response_model=list[HistoryItem])
async def list_history(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    favorites_only: bool = Query(False),
    q: str | None = Query(None, description="Search by requirement text (case-insensitive)"),
    svc: HistoryService = Depends(_svc),
    current_user: dict = Depends(get_current_user),
):
    return await svc.list(
        user_id=current_user["_id"],
        skip=skip,
        limit=limit,
        favorites_only=favorites_only,
        search=q,
    )


@router.get("/{history_id}", response_model=HistoryDetail)
async def get_history(
    history_id: str,
    svc: HistoryService = Depends(_svc),
    current_user: dict = Depends(get_current_user),
):
    return await svc.get(history_id, current_user["_id"])


@router.delete("/{history_id}", status_code=204)
async def delete_history(
    history_id: str,
    svc: HistoryService = Depends(_svc),
    current_user: dict = Depends(get_current_user),
):
    await svc.delete(history_id, current_user["_id"])


@router.post("/{history_id}/favorite", response_model=HistoryItem)
async def toggle_favorite(
    history_id: str,
    svc: HistoryService = Depends(_svc),
    current_user: dict = Depends(get_current_user),
):
    return await svc.toggle_favorite(history_id, current_user["_id"])
