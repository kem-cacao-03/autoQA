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
    def _to_item(
        doc: dict,
        providers: list[str] | None = None,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        total_tokens: int | None = None,
        elapsed_seconds: float | None = None,
    ) -> HistoryItem:
        _in  = input_tokens  if input_tokens  is not None else doc.get("input_tokens",  0)
        _out = output_tokens if output_tokens is not None else doc.get("output_tokens", 0)
        _tot = total_tokens  if total_tokens  is not None else doc.get("total_tokens",  _in + _out)
        return HistoryItem(
            id=str(doc["_id"]),
            requirement=doc["requirement"],
            provider=doc["provider"],
            providers=providers or [doc["provider"]],
            session_id=doc.get("session_id"),
            mode=doc.get("mode", "pipeline"),
            language=doc.get("language", "English"),
            total_count=doc["result"]["total_count"],
            is_favorite=doc.get("is_favorite", False),
            created_at=doc["created_at"],
            input_tokens=_in,
            output_tokens=_out,
            total_tokens=_tot,
            elapsed_seconds=elapsed_seconds if elapsed_seconds is not None else doc.get("elapsed_seconds"),
        )

    @staticmethod
    def _to_detail(doc: dict) -> HistoryDetail:
        _in  = doc.get("input_tokens",  0)
        _out = doc.get("output_tokens", 0)
        return HistoryDetail(
            id=str(doc["_id"]),
            requirement=doc["requirement"],
            provider=doc["provider"],
            providers=[doc["provider"]],
            session_id=doc.get("session_id"),
            mode=doc.get("mode", "pipeline"),
            language=doc.get("language", "English"),
            total_count=doc["result"]["total_count"],
            is_favorite=doc.get("is_favorite", False),
            created_at=doc["created_at"],
            input_tokens=_in,
            output_tokens=_out,
            total_tokens=doc.get("total_tokens", _in + _out),
            elapsed_seconds=doc.get("elapsed_seconds"),
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

        # Fetch extra docs to account for research deduplication (up to 3 per session).
        internal_limit = limit * 3
        docs = await (
            self._col.find(query)
            .sort("created_at", -1)
            .skip(skip)
            .limit(internal_limit)
            .to_list(length=internal_limit)
        )

        # Deduplicate: research docs sharing a session_id collapse into one entry.
        seen_sessions: set[str] = set()
        result: list[HistoryItem] = []

        for doc in docs:
            session_id = doc.get("session_id")
            if session_id and doc.get("mode") == "research":
                if session_id in seen_sessions:
                    continue  # skip duplicate provider entries
                seen_sessions.add(session_id)
                # Collect all providers for this session from the fetched batch.
                session_docs = [d for d in docs if d.get("session_id") == session_id]
                providers = sorted({d["provider"] for d in session_docs})
                # Aggregate stats: sum tokens, max elapsed (providers run in parallel)
                agg_in  = sum(d.get("input_tokens",  0) for d in session_docs)
                agg_out = sum(d.get("output_tokens", 0) for d in session_docs)
                agg_tot = sum(d.get("total_tokens",  0) for d in session_docs)
                raw_elapsed = [d.get("elapsed_seconds") for d in session_docs if d.get("elapsed_seconds") is not None]
                agg_elapsed = max(raw_elapsed) if raw_elapsed else None
                result.append(self._to_item(
                    doc, providers=providers,
                    input_tokens=agg_in, output_tokens=agg_out, total_tokens=agg_tot,
                    elapsed_seconds=agg_elapsed,
                ))
            else:
                result.append(self._to_item(doc))

            if len(result) >= limit:
                break

        return result

    # ── Get detail ───────────────────────────────────────────────────────────

    async def get(self, history_id: str, user_id: str) -> HistoryDetail:
        doc = await self._col.find_one({"_id": history_id, "user_id": user_id})
        if not doc:
            raise HTTPException(status_code=404, detail="History item not found.")

        # Research mode: collect all sibling provider results via shared session_id
        all_results = None
        provider_stats = None
        if doc.get("mode") == "research" and doc.get("session_id"):
            siblings = await self._col.find(
                {"session_id": doc["session_id"], "user_id": user_id}
            ).sort("provider", 1).to_list(length=10)
            if len(siblings) > 1:
                all_results = [GenerationResult(**s["result"]) for s in siblings]
                provider_stats = {
                    s["provider"]: {
                        "input_tokens": s.get("input_tokens", 0),
                        "output_tokens": s.get("output_tokens", 0),
                        "total_tokens": s.get("total_tokens", 0),
                        "elapsed_seconds": s.get("elapsed_seconds"),
                    }
                    for s in siblings
                }

        detail = self._to_detail(doc)
        return detail.model_copy(update={"all_results": all_results, "provider_stats": provider_stats})

    # ── Delete ───────────────────────────────────────────────────────────────

    async def delete(self, history_id: str, user_id: str) -> None:
        doc = await self._col.find_one({"_id": history_id, "user_id": user_id})
        if not doc:
            raise HTTPException(status_code=404, detail="History item not found.")

        session_id = doc.get("session_id")
        if session_id and doc.get("mode") == "research":
            # Delete all provider docs belonging to this research session.
            await self._col.delete_many({"session_id": session_id, "user_id": user_id})
        else:
            await self._col.delete_one({"_id": history_id, "user_id": user_id})

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
