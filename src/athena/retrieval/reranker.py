"""
Cross-encoder reranker for precision boost with fast caching.

Design decision: two-stage retrieval (bi-encoder retrieve → cross-encoder rerank).

Why rerank?
- Bi-encoders (MiniLM) encode query and document independently — fast but approximate.
- Cross-encoders jointly score (query, document) pairs — slower but much more accurate.
- Standard production pattern: retrieve 20-50 candidates cheaply, rerank top 10 precisely.
- ms-marco-MiniLM-L-6-v2 is trained on MS MARCO passage ranking — good general reranker.
"""

from __future__ import annotations

import logging

from sentence_transformers import CrossEncoder

from athena.config.settings import RerankerConfig
from athena.models import RetrievalResult

logger = logging.getLogger(__name__)


class CrossEncoderReranker:
    """Rerank retrieval candidates using a cross-encoder model with fast memoization."""

    def __init__(self, config: RerankerConfig) -> None:
        self.config = config
        logger.info("Loading cross-encoder reranker: %s", config.model)
        self.model = CrossEncoder(config.model)
        self._score_cache: dict[tuple[str, str], float] = {}

    def rerank(
        self,
        query: str,
        candidates: list[RetrievalResult],
        top_k: int,
    ) -> list[RetrievalResult]:
        if not candidates:
            return []

        # If only 1 candidate, no need for cross-encoder pass
        if len(candidates) == 1:
            candidates[0].rerank_score = 1.0
            return candidates

        pairs_to_predict = []
        indices_to_predict = []

        for i, c in enumerate(candidates):
            key = (query, c.text[:200])
            if key in self._score_cache:
                c.rerank_score = self._score_cache[key]
            else:
                pairs_to_predict.append((query, c.text))
                indices_to_predict.append(i)

        if pairs_to_predict:
            scores = self.model.predict(pairs_to_predict, batch_size=self.config.batch_size)
            for idx, (query, text), score in zip(indices_to_predict, pairs_to_predict, scores):
                sc = float(score)
                candidates[idx].rerank_score = sc
                if len(self._score_cache) > 1000:
                    self._score_cache.pop(next(iter(self._score_cache)))
                self._score_cache[(query, text[:200])] = sc

        reranked = sorted(candidates, key=lambda c: c.rerank_score or 0.0, reverse=True)
        return reranked[:top_k]
