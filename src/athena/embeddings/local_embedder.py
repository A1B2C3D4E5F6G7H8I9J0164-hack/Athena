"""
Local embedding model wrapper with fast query caching.

Design decision: sentence-transformers/all-MiniLM-L6-v2 (384-dim, ~80MB).
- Free, runs locally, no API key — ideal for portfolio demos and eval loops.
- Good enough when combined with BM25 hybrid retrieval + cross-encoder reranking.
- Includes LRU query embedding cache to avoid redundant neural passes.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Sequence

import numpy as np
from sentence_transformers import SentenceTransformer

from athena.config.settings import EmbeddingsConfig

logger = logging.getLogger(__name__)


class LocalEmbedder:
    """Thin wrapper around SentenceTransformer with LRU query caching and lazy loading."""

    def __init__(self, config: EmbeddingsConfig) -> None:
        self.config = config
        self._model: SentenceTransformer | None = None
        self._dimension: int = 384
        self._query_cache: dict[str, np.ndarray] = {}

    @property
    def model(self) -> SentenceTransformer:
        if self._model is None:
            try:
                import torch
                torch.set_num_threads(1)
                torch.set_grad_enabled(False)
            except Exception:
                pass
            logger.info("Lazy loading embedding model: %s", self.config.model)
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(self.config.model, device=self.config.device)
            self._dimension = self._model.get_sentence_embedding_dimension()
            logger.info("Embedding model loaded, dimension: %d", self._dimension)
        return self._model

    @property
    def dimension(self) -> int:
        return self._dimension

    def embed_documents(self, texts: Sequence[str]) -> np.ndarray:
        """Encode document chunks for storage in ChromaDB."""
        return self.model.encode(
            list(texts),
            batch_size=self.config.batch_size,
            show_progress_bar=len(texts) > 50,
            normalize_embeddings=True,  # Cosine similarity == dot product
        )

    def embed_query(self, query: str) -> np.ndarray:
        """Encode a single query vector with fast in-memory caching."""
        clean_q = query.strip()
        if clean_q in self._query_cache:
            return self._query_cache[clean_q]

        embedding = self.model.encode(
            clean_q,
            normalize_embeddings=True,
        )
        if len(self._query_cache) > 500:
            self._query_cache.pop(next(iter(self._query_cache)))
        self._query_cache[clean_q] = embedding
        return embedding
