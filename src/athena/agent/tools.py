"""
Agent tools: rag_search and web_search with low-latency caching and timeouts.

These are the two retrieval backends the router chooses between.
Phase 3 FastAPI exposes the same tools through the agent graph.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

from athena.config.settings import AthenaConfig
from athena.retrieval.hybrid_pipeline import HybridRetrievalPipeline

logger = logging.getLogger(__name__)

# Fast memory cache for web search results (TTL 5 mins)
_WEB_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}


@dataclass
class RAGSearchTool:
    """Hybrid RAG search over the local knowledge base."""

    config: AthenaConfig
    _pipeline: HybridRetrievalPipeline | None = None

    @property
    def pipeline(self) -> HybridRetrievalPipeline:
        if self._pipeline is None:
            self._pipeline = HybridRetrievalPipeline(self.config)
        return self._pipeline

    def invalidate_bm25_cache(self) -> None:
        if self._pipeline:
            self._pipeline.invalidate_bm25_cache()
        self._pipeline = None

    def search(self, query: str) -> list[dict[str, Any]]:
        result = self.pipeline.retrieve(query)
        return [
            {
                "chunk_id": r.chunk_id,
                "text": r.text,
                "citation": r.citation_label(),
                "source_path": r.source_path,
                "page_number": r.page_number,
                "rerank_score": r.rerank_score,
                "source_type": "document",
            }
            for r in result.results
        ]


def web_search(query: str, max_results: int = 3, timeout_sec: float = 3.0) -> list[dict[str, Any]]:
    """
    Live web search via DuckDuckGo with fast in-memory caching and strict timeout.
    """
    clean_q = query.strip().lower()
    now = time.time()

    # Check cache
    if clean_q in _WEB_CACHE:
        timestamp, cached_results = _WEB_CACHE[clean_q]
        if now - timestamp < 300:  # 5 min TTL
            return cached_results

    try:
        try:
            from ddgs import DDGS
        except ImportError:
            from duckduckgo_search import DDGS

        results: list[dict[str, Any]] = []
        with DDGS(timeout=int(timeout_sec)) as ddgs:
            for i, item in enumerate(ddgs.text(query, max_results=max_results)):
                results.append(
                    {
                        "id": f"web_{i}",
                        "title": item.get("title", ""),
                        "text": item.get("body", ""),
                        "url": item.get("href", ""),
                        "citation": item.get("title", item.get("href", "Web")),
                        "source_type": "web",
                    }
                )
        logger.info("Web search returned %d results for '%s'", len(results), query[:50])

        if len(_WEB_CACHE) > 200:
            _WEB_CACHE.pop(next(iter(_WEB_CACHE)))
        _WEB_CACHE[clean_q] = (now, results)

        return results
    except Exception as exc:
        logger.warning("Web search error/timeout: %s", exc)
        return []
