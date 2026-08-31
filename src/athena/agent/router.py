"""
Query router — decides between local RAG, web search, or both.

Design decision: rule-based router first, LLM-assisted planning second.

Why not LLM-only routing?
- Deterministic rules are fast, free, and explainable in interviews.
- LLM plan node still runs for complex queries when an LLM is available.
- Rules handle obvious cases: "latest news" → web, "what does our doc say" → rag.
"""

from __future__ import annotations

import re

from athena.agent.state import RouteDecision
from athena.config.settings import AgentConfig


def route_query(query: str, config: AgentConfig, has_local_docs: bool) -> RouteDecision:
    """
    Classify query into rag | web | both.

    Heuristics (explicit, tunable via config/default.yaml):
    1. Web keywords → web or both
    2. No local docs → web only
    3. Default → rag (local knowledge base)
    """
    q_lower = query.lower()
    keywords = [str(kw) for kw in config.web_keywords]
    web_pattern = "|".join(re.escape(kw) for kw in keywords)
    needs_web = bool(re.search(rf"\b({web_pattern})\b", q_lower))

    if not has_local_docs:
        return "web"

    if needs_web:
        # Hybrid: check local KB first, supplement with web for freshness
        return "both"

    return "rag"


def build_plan(query: str, route: RouteDecision) -> str:
    """Human-readable plan string shown in the UI step indicator."""
    plans = {
        "rag": f"Search local knowledge base for: {query}",
        "web": f"Search the web for current information: {query}",
        "both": f"Cross-reference local documents and live web results for: {query}",
    }
    return plans.get(route, query)
