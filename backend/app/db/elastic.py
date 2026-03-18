"""
Elasticsearch client lifecycle.

Public API:
  connect_es()   — open async client, create index if absent
  close_es()     — close client on shutdown
  get_es()       — return the active AsyncElasticsearch instance
"""

import logging

from elasticsearch import AsyncElasticsearch

from app.core.config import settings

logger = logging.getLogger(__name__)

INDEX = "autoqa_history"

_es: AsyncElasticsearch | None = None

_INDEX_MAPPING = {
    "mappings": {
        "properties": {
            "user_id":          {"type": "keyword"},
            "session_id":       {"type": "keyword"},
            "requirement":      {"type": "text", "analyzer": "standard"},
            "test_suite_name":  {"type": "text", "analyzer": "standard"},
            "description":      {"type": "text", "analyzer": "standard"},
            "test_case_titles": {"type": "text", "analyzer": "standard"},
            "mode":             {"type": "keyword"},
            "language":         {"type": "keyword"},
            "is_favorite":      {"type": "boolean"},
            "created_at":       {"type": "date"},
        }
    }
}


async def connect_es() -> None:
    """Open async ES client and create the history index if it does not exist."""
    global _es
    _es = AsyncElasticsearch(settings.ELASTICSEARCH_URL)
    try:
        info = await _es.info()
        logger.info("[ES] Connected → %s  version=%s", settings.ELASTICSEARCH_URL,
                    info["version"]["number"])
        exists = await _es.indices.exists(index=INDEX)
        if not exists:
            await _es.indices.create(index=INDEX, body=_INDEX_MAPPING)
            logger.info("[ES] Index '%s' created.", INDEX)
        else:
            logger.info("[ES] Index '%s' already exists.", INDEX)
    except Exception as exc:
        logger.warning("[ES] Startup failed — search will fall back to MongoDB: %s", exc)


async def close_es() -> None:
    """Close the ES client on shutdown."""
    global _es
    if _es is not None:
        await _es.close()
        _es = None
        logger.info("[ES] Connection closed.")


def get_es() -> AsyncElasticsearch:
    if _es is None:
        raise RuntimeError("Elasticsearch not initialised. Call connect_es() first.")
    return _es
