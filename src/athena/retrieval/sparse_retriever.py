"""
Sparse (BM25) retriever for lexical matching.

Design decision: hybrid retrieval (dense + sparse) over pure vector search.

Why hybrid?
- Dense embeddings miss exact keyword matches (product codes, names, acronyms).
- BM25 excels at term-frequency signals that embeddings smooth over.
- Combining both via Reciprocal Rank Fusion gives robust recall without
  hand-tuning score normalization between heterogeneous rankers.
"""

from __future__ import annotations

import logging
import re
from typing import Sequence

from rank_bm25 import BM25Okapi

from athena.models import RetrievalResult

logger = logging.getLogger(__name__)


def tokenize(text: str) -> list[str]:
    """Simple whitespace + punctuation tokenizer — no NLTK dependency."""
    return re.findall(r"\b\w+\b", text.lower())


class BM25Retriever:
    """
    In-memory BM25 index built from all chunks in the vector store.

    Rebuilt on each query for simplicity (fine at portfolio scale).
    For production: persist the BM25 index or use Elasticsearch/Opensearch.
    """

    def __init__(self) -> None:
        self._ids: list[str] = []
        self._documents: list[str] = []
        self._metadatas: list[dict] = []
        self._bm25: BM25Okapi | None = None

    @property
    def is_ready(self) -> bool:
        return self._bm25 is not None and len(self._ids) > 0

    def build_index(
        self,
        ids: Sequence[str],
        documents: Sequence[str],
        metadatas: Sequence[dict],
    ) -> None:
        """Build (or rebuild) the BM25 index from corpus documents."""
        self._ids = list(ids)
        self._documents = list(documents)
        self._metadatas = list(metadatas)

        tokenized = [tokenize(doc) for doc in self._documents]
        self._bm25 = BM25Okapi(tokenized)
        logger.info("BM25 index built over %d documents", len(self._ids))

    def search(self, query: str, top_k: int) -> list[RetrievalResult]:
        if not self.is_ready or not self._bm25:
            return []

        query_tokens = tokenize(query)
        if not query_tokens:
            return []

        scores = self._bm25.get_scores(query_tokens)
        ranked_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)

        results: list[RetrievalResult] = []
        for idx in ranked_indices[:top_k]:
            if scores[idx] <= 0:
                break
            results.append(
                RetrievalResult(
                    chunk_id=self._ids[idx],
                    text=self._documents[idx],
                    metadata=self._metadatas[idx],
                    sparse_score=float(scores[idx]),
                )
            )
        return results
