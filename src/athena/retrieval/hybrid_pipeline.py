"""
Hybrid retrieval pipeline: Dense → Sparse → RRF Fusion → Cross-Encoder Rerank.

This is the core retrieval engine reused by:
- Phase 1 eval script
- Phase 2 agent's rag_search tool
- Phase 3 FastAPI /query endpoint
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

from athena.config.settings import AthenaConfig
from athena.embeddings.local_embedder import LocalEmbedder
from athena.models import RetrievalResult
from athena.retrieval.fusion import reciprocal_rank_fusion
from athena.retrieval.reranker import CrossEncoderReranker
from athena.retrieval.sparse_retriever import BM25Retriever
from athena.storage.chroma_store import ChromaVectorStore

logger = logging.getLogger(__name__)


@dataclass
class RetrievalPipelineResult:
    """Full retrieval output with per-stage results for debugging and metrics."""

    results: list[RetrievalResult]
    query: str
    dense_results: list[RetrievalResult] = field(default_factory=list)
    sparse_results: list[RetrievalResult] = field(default_factory=list)
    fused_results: list[RetrievalResult] = field(default_factory=list)
    elapsed_ms: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "query": self.query,
            "elapsed_ms": round(self.elapsed_ms, 2),
            "result_count": len(self.results),
            "results": [
                {
                    "chunk_id": r.chunk_id,
                    "text": r.text[:200] + "..." if len(r.text) > 200 else r.text,
                    "citation": r.citation_label(),
                    "dense_score": r.dense_score,
                    "sparse_score": r.sparse_score,
                    "rrf_score": r.rrf_score,
                    "rerank_score": r.rerank_score,
                }
                for r in self.results
            ],
        }


class HybridRetrievalPipeline:
    """
    End-to-end hybrid retrieval orchestrator.

    Pipeline stages (explicit, not hidden in one function):
    1. Dense retrieval  — cosine similarity via ChromaDB + MiniLM embeddings
    2. Sparse retrieval — BM25 keyword matching
    3. RRF fusion       — merge ranked lists without score normalization
    4. Cross-encoder    — rerank fused candidates for precision
    """

    def __init__(self, config: AthenaConfig) -> None:
        self.config = config
        self.embedder = LocalEmbedder(config.embeddings)
        self.vector_store = ChromaVectorStore(config)
        self.bm25 = BM25Retriever()
        self.reranker = CrossEncoderReranker(config.reranker)
        self._bm25_built = False

    def _ensure_bm25_index(self) -> None:
        if self._bm25_built:
            return
        ids, docs, metas = self.vector_store.get_all_documents()
        if ids:
            self.bm25.build_index(ids, docs, metas)
        self._bm25_built = True

    def invalidate_bm25_cache(self) -> None:
        """Call after ingestion to force BM25 index rebuild on next query."""
        self._bm25_built = False

    def retrieve(self, query: str) -> RetrievalPipelineResult:
        start = time.perf_counter()
        rc = self.config.retrieval

        # Stage 1: Dense retrieval
        query_embedding = self.embedder.embed_query(query)
        dense_results = self.vector_store.dense_search(query_embedding, rc.dense_top_k)

        # Stage 2: Sparse retrieval
        self._ensure_bm25_index()
        sparse_results = self.bm25.search(query, rc.sparse_top_k)

        # Stage 3: Reciprocal Rank Fusion
        fused_results = reciprocal_rank_fusion(
            [dense_results, sparse_results],
            rrf_k=rc.rrf_k,
            top_k=rc.fusion_top_k,
        )

        # Stage 4: Cross-encoder reranking
        final_results = self.reranker.rerank(query, fused_results, rc.rerank_top_k)

        elapsed_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "Retrieval for '%s…': dense=%d sparse=%d fused=%d final=%d (%.1f ms)",
            query[:50],
            len(dense_results),
            len(sparse_results),
            len(fused_results),
            len(final_results),
            elapsed_ms,
        )

        return RetrievalPipelineResult(
            results=final_results,
            query=query,
            dense_results=dense_results,
            sparse_results=sparse_results,
            fused_results=fused_results,
            elapsed_ms=elapsed_ms,
        )
