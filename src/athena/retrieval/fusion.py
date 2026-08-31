"""
Reciprocal Rank Fusion (RRF) for merging dense and sparse retrieval results.

Design decision: RRF over weighted score averaging.

Why RRF?
- Dense (cosine similarity) and sparse (BM25) scores live on different scales.
- RRF only uses rank positions, not raw scores — no fragile normalization needed.
- Formula: RRF_score(d) = Σ 1 / (k + rank_i(d))  where k=60 is the standard constant.
- Reference: Cormack et al., "Reciprocal Rank Fusion outperforms Condorcet and individual
  Rank Learning Methods" (SIGIR 2009).
"""

from __future__ import annotations

import logging
from collections import defaultdict

from athena.models import RetrievalResult

logger = logging.getLogger(__name__)


def reciprocal_rank_fusion(
    result_lists: list[list[RetrievalResult]],
    rrf_k: int = 60,
    top_k: int = 10,
) -> list[RetrievalResult]:
    """
    Merge multiple ranked lists into one using Reciprocal Rank Fusion.

    Args:
        result_lists: Each inner list is a ranked retrieval result from one retriever.
        rrf_k: Smoothing constant (60 is the literature default).
        top_k: Number of fused results to return.
    """
    rrf_scores: dict[str, float] = defaultdict(float)
    best_result: dict[str, RetrievalResult] = {}

    for results in result_lists:
        for rank, result in enumerate(results, start=1):
            rrf_scores[result.chunk_id] += 1.0 / (rrf_k + rank)

            # Keep the RetrievalResult object with the richest metadata
            if result.chunk_id not in best_result:
                best_result[result.chunk_id] = result

    sorted_ids = sorted(rrf_scores.keys(), key=lambda cid: rrf_scores[cid], reverse=True)

    fused: list[RetrievalResult] = []
    for chunk_id in sorted_ids[:top_k]:
        result = best_result[chunk_id]
        result.rrf_score = rrf_scores[chunk_id]
        fused.append(result)

    logger.debug("RRF fused %d lists → %d results", len(result_lists), len(fused))
    return fused
