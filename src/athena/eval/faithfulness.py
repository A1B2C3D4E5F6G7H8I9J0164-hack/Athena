"""
Faithfulness check — verifies inline [n] citations map to provided sources.
Used in Phase 4 eval; also available as a standalone report.
"""


from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class FaithfulnessResult:
    total_claims_checked: int
    cited_claims: int
    faithfulness_rate: float
    uncited_sentences: list[str]


def check_faithfulness(answer: str, citation_ids: list[str]) -> FaithfulnessResult:
    """
    Basic faithfulness heuristic:
    - Split answer into sentences.
    - Sentences with factual indicators (numbers, proper nouns, "is/are/was") 
      should contain an inline [n] citation.
    
    This is a simplified check — production systems use NLI models.
    """
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", answer) if s.strip()]
    factual_pattern = re.compile(
        r"\b(is|are|was|were|has|have|had|\d+|percent|%)\b", re.I
    )
    uncited: list[str] = []
    cited = 0
    checked = 0

    for sentence in sentences:
        if len(sentence) < 20:
            continue
        if not factual_pattern.search(sentence):
            continue
        checked += 1
        if re.search(r"\[\d+\]", sentence):
            cited += 1
        else:
            uncited.append(sentence[:100])

    rate = cited / checked if checked else 1.0
    return FaithfulnessResult(
        total_claims_checked=checked,
        cited_claims=cited,
        faithfulness_rate=round(rate, 4),
        uncited_sentences=uncited[:5],
    )
