"""
Elasticsearch indexing helpers for the history module.

Public API:
  index_doc(doc_id, doc)   — upsert one history document into ES
  delete_doc(doc_id)       — remove a document from the ES index
  delete_session(session_id) — remove all docs belonging to a research session
  search_ids(user_id, q)   — full-text search; returns list of matching doc _ids

All functions are best-effort: callers should catch exceptions and fall back
to MongoDB when ES is unavailable.
"""

import logging
from datetime import datetime

from app.db.elastic import INDEX, get_es

logger = logging.getLogger(__name__)


async def index_doc(doc_id: str, doc: dict) -> None:
    """Upsert a history document into the ES index."""
    result = doc.get("result", {})
    titles = [tc.get("title", "") for tc in result.get("test_cases", []) if tc.get("title")]
    created_at = doc.get("created_at")
    if isinstance(created_at, datetime):
        created_at = created_at.isoformat()

    await get_es().index(
        index=INDEX,
        id=doc_id,
        document={
            "user_id":          doc["user_id"],
            "session_id":       doc.get("session_id"),
            "requirement":      doc.get("requirement", ""),
            "test_suite_name":  result.get("test_suite_name", ""),
            "description":      result.get("description", ""),
            "test_case_titles": titles,
            "mode":             doc.get("mode", "pipeline"),
            "language":         doc.get("language", "English"),
            "is_favorite":      doc.get("is_favorite", False),
            "created_at":       created_at,
        },
    )


async def delete_doc(doc_id: str) -> None:
    """Delete a single document from ES (ignores 404)."""
    await get_es().delete(index=INDEX, id=doc_id, ignore_status=404)


async def delete_session(session_id: str, user_id: str) -> None:
    """Delete all ES documents belonging to a research session."""
    await get_es().delete_by_query(
        index=INDEX,
        body={
            "query": {
                "bool": {
                    "filter": [
                        {"term": {"session_id": session_id}},
                        {"term": {"user_id": user_id}},
                    ]
                }
            }
        },
    )


async def search_ids(user_id: str, q: str) -> list[str]:
    """
    Full-text search across requirement, test_suite_name, description, and test
    case titles for the given user.  Returns a list of matching MongoDB doc IDs.

    Uses multi_match with fuzziness so partial / misspelled queries still hit.
    """
    resp = await get_es().search(
        index=INDEX,
        body={
            "query": {
                "bool": {
                    "must": {
                        "multi_match": {
                            "query": q,
                            "fields": [
                                "requirement^3",
                                "test_suite_name^2",
                                "description",
                                "test_case_titles",
                            ],
                            "type": "best_fields",
                            "fuzziness": "AUTO",
                        }
                    },
                    "filter": {"term": {"user_id": user_id}},
                }
            },
            "size": 200,
            "_source": False,
        },
    )
    return [hit["_id"] for hit in resp["hits"]["hits"]]
