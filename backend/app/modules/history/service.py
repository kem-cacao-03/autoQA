"""
HistoryService — CRUD + favourite-toggle for persisted generation results.

Imports GenerationResult from app.core.schemas (shared contract),
NOT from generator/schema.py — that would create a cross-module dependency.
"""

from datetime import datetime

from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.schemas import GenerationResult
from app.modules.history.schema import HistoryDetail, HistoryItem

COLLECTION = "history"


class HistoryService:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db[COLLECTION]

    # ── Helpers ──────────────────────────────────────────────────────────────

    @staticmethod
    def _to_item(doc: dict) -> HistoryItem:
        return HistoryItem(
            id=str(doc["_id"]),
            requirement=doc["requirement"],
            provider=doc["provider"],
            test_type=doc["test_type"],
            mode=doc.get("mode", "pipeline"),
            language=doc.get("language", "English"),
            total_count=doc["result"]["total_count"],
            is_favorite=doc.get("is_favorite", False),
            created_at=doc["created_at"],
        )

    @staticmethod
    def _to_detail(doc: dict) -> HistoryDetail:
        return HistoryDetail(
            id=str(doc["_id"]),
            requirement=doc["requirement"],
            provider=doc["provider"],
            test_type=doc["test_type"],
            mode=doc.get("mode", "pipeline"),
            language=doc.get("language", "English"),
            total_count=doc["result"]["total_count"],
            is_favorite=doc.get("is_favorite", False),
            created_at=doc["created_at"],
            result=GenerationResult(**doc["result"]),
        )

    # ── List ─────────────────────────────────────────────────────────────────

    async def list(
        self,
        user_id: str,
        skip: int = 0,
        limit: int = 20,
        favorites_only: bool = False,
        search: str | None = None,
    ) -> list[HistoryItem]:
        query: dict = {"user_id": user_id}
        if favorites_only:
            query["is_favorite"] = True
        if search and search.strip():
            query["requirement"] = {"$regex": search.strip(), "$options": "i"}

        cursor = (
            self._col.find(query)
            .sort("created_at", -1)
            .skip(skip)
            .limit(limit)
        )
        docs = await cursor.to_list(length=limit)
        return [self._to_item(d) for d in docs]

    # ── Get detail ───────────────────────────────────────────────────────────

    async def get(self, history_id: str, user_id: str) -> HistoryDetail:
        doc = await self._col.find_one({"_id": history_id, "user_id": user_id})
        if not doc:
            raise HTTPException(status_code=404, detail="History item not found.")
        return self._to_detail(doc)

    # ── Delete ───────────────────────────────────────────────────────────────

    async def delete(self, history_id: str, user_id: str) -> None:
        res = await self._col.delete_one({"_id": history_id, "user_id": user_id})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="History item not found.")

    # ── Toggle favourite ─────────────────────────────────────────────────────

    async def toggle_favorite(self, history_id: str, user_id: str) -> HistoryItem:
        doc = await self._col.find_one({"_id": history_id, "user_id": user_id})
        if not doc:
            raise HTTPException(status_code=404, detail="History item not found.")

        new_value = not doc.get("is_favorite", False)
        await self._col.update_one(
            {"_id": history_id},
            {"$set": {"is_favorite": new_value}},
        )
        doc["is_favorite"] = new_value
        return self._to_item(doc)
