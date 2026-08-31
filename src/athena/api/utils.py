"""Shared API utilities."""

from __future__ import annotations

from athena.config.settings import AthenaConfig, load_config
from athena.storage.chroma_store import ChromaVectorStore


def get_doc_count(config: AthenaConfig | None = None) -> int:
    config = config or load_config()
    try:
        return ChromaVectorStore(config).count
    except Exception:
        return 0
