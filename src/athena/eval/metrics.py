"""
Retrieval evaluation metrics.

Computes precision@k and recall@k against a labeled Q&A set.

Important: metrics are only meaningful with a properly labeled eval set.
We do NOT fabricate numbers — run `athena eval` on your own qa_pairs.json.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from athena.models import RetrievalResult
from athena.retrieval.hybrid_pipeline import HybridRetrievalPipeline

logger = logging.getLogger(__name__)


@dataclass
class QAPair:
    """One labeled question with known relevant chunk IDs."""

    question: str
    relevant_chunk_ids: list[str]
    # Optional: relevant source pages for auto-matching when chunk IDs aren't pre-computed
    relevant_sources: list[dict[str, Any]] = field(default_factory=list)
    notes: str = ""


@dataclass
class EvalMetrics:
    """Aggregated metrics across all Q&A pairs."""

    precision_at_k: dict[int, float] = field(default_factory=dict)
    recall_at_k: dict[int, float] = field(default_factory=dict)
    mrr: float = 0.0  # Mean Reciprocal Rank
    total_questions: int = 0
    per_question: list[dict[str, Any]] = field(default_factory=list)

    def to_table_rows(self) -> list[dict[str, Any]]:
        """Format for README metrics table (Phase 4)."""
        rows = []
        for k in sorted(self.precision_at_k.keys()):
            rows.append(
                {
                    "k": k,
                    "precision@k": round(self.precision_at_k[k], 4),
                    "recall@k": round(self.recall_at_k[k], 4),
                }
            )
        rows.append({"metric": "MRR", "value": round(self.mrr, 4)})
        return rows


def load_qa_pairs(path: Path) -> list[QAPair]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return [
        QAPair(
            question=item["question"],
            relevant_chunk_ids=item.get("relevant_chunk_ids", []),
            relevant_sources=item.get("relevant_sources", []),
            notes=item.get("notes", ""),
        )
        for item in raw
    ]


def _is_relevant(result: RetrievalResult, qa: QAPair) -> bool:
    """Check if a retrieved chunk is labeled as relevant."""
    if result.chunk_id in qa.relevant_chunk_ids:
        return True

    # Fallback: match by source path + page number
    for src in qa.relevant_sources:
        if (
            result.source_path.endswith(src.get("filename", "___none___"))
            and result.page_number == src.get("page", -99)
        ):
            return True

    return False


def precision_at_k(results: list[RetrievalResult], qa: QAPair, k: int) -> float:
    """Fraction of top-k retrieved chunks that are relevant."""
    top_k = results[:k]
    if not top_k:
        return 0.0
    hits = sum(1 for r in top_k if _is_relevant(r, qa))
    return hits / len(top_k)


def recall_at_k(results: list[RetrievalResult], qa: QAPair, k: int) -> float:
    """
    Fraction of labeled relevant items found in top-k.

    When qa uses relevant_chunk_ids: standard |relevant ∩ top-k| / |relevant|.
    When qa uses relevant_sources (page-level labels): binary recall —
    1.0 if any matching chunk appears in top-k, else 0.0.
    """
    top_k = results[:k]
    if not top_k:
        return 0.0

    if qa.relevant_chunk_ids:
        total_relevant = len(qa.relevant_chunk_ids)
        hits = sum(1 for r in top_k if _is_relevant(r, qa))
        return min(hits / total_relevant, 1.0)

    if qa.relevant_sources:
        return 1.0 if any(_is_relevant(r, qa) for r in top_k) else 0.0

    return 0.0


def reciprocal_rank(results: list[RetrievalResult], qa: QAPair) -> float:
    """Reciprocal rank of the first relevant result (for MRR)."""
    for rank, result in enumerate(results, start=1):
        if _is_relevant(result, qa):
            return 1.0 / rank
    return 0.0


def run_evaluation(
    pipeline: HybridRetrievalPipeline,
    qa_pairs: list[QAPair],
    k_values: list[int],
) -> EvalMetrics:
    """
    Run full retrieval eval over labeled Q&A pairs.

    Returns aggregated metrics — NOT fabricated; computed from actual retrieval output.
    """
    metrics = EvalMetrics(total_questions=len(qa_pairs))
    precision_sums: dict[int, float] = {k: 0.0 for k in k_values}
    recall_sums: dict[int, float] = {k: 0.0 for k in k_values}
    rr_sum = 0.0

    for qa in qa_pairs:
        # Retrieve with a large top_k to evaluate all k values from one call
        max_k = max(k_values)
        original_rerank_k = pipeline.config.retrieval.rerank_top_k
        pipeline.config.retrieval.rerank_top_k = max_k

        result = pipeline.retrieve(qa.question)
        retrieved = result.results

        pipeline.config.retrieval.rerank_top_k = original_rerank_k

        question_metrics: dict[str, Any] = {"question": qa.question, "k": {}}
        for k in k_values:
            p = precision_at_k(retrieved, qa, k)
            r = recall_at_k(retrieved, qa, k)
            precision_sums[k] += p
            recall_sums[k] += r
            question_metrics["k"][str(k)] = {"precision": round(p, 4), "recall": round(r, 4)}

        rr = reciprocal_rank(retrieved, qa)
        rr_sum += rr
        question_metrics["reciprocal_rank"] = round(rr, 4)
        question_metrics["retrieved_ids"] = [r.chunk_id for r in retrieved]
        metrics.per_question.append(question_metrics)

    n = len(qa_pairs) or 1
    metrics.precision_at_k = {k: precision_sums[k] / n for k in k_values}
    metrics.recall_at_k = {k: recall_sums[k] / n for k in k_values}
    metrics.mrr = rr_sum / n

    return metrics
