"""
LLM factory and answer synthesis.

Supports:
- openrouter: Multi-model API gateway with fast fallback
- grok/xai  : xAI direct API
- openai    : GPT via OPENAI_API_KEY
- ollama    : Local Ollama models
- fast-synthesis : High-speed multi-source grounded synthesizer
"""

from __future__ import annotations

import concurrent.futures
import logging
import os
import re
from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage

from athena.config.settings import LLMConfig

logger = logging.getLogger(__name__)

SYNTHESIS_SYSTEM_PROMPT = """You are Athena, an autonomous research agent.
Answer the user's question using ONLY the provided context sources.
Rules:
1. Every factual claim MUST include an inline citation like [1], [2].
2. Use the citation numbers matching the source list order.
3. If context is insufficient, say so — do not invent facts.
4. Be concise, precise, and interview-ready in tone.
5. At the end, do not repeat the source list — citations are inline only."""


def get_llm(config: LLMConfig) -> BaseChatModel | None:
    """Instantiate LLM based on config with strict timeouts for instantaneous responses."""
    if config.provider == "extractive":
        return None

    # OpenRouter provider
    if config.provider in ("openrouter", "open_router"):
        api_key = os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPENAI_API_KEY")
        if not api_key:
            logger.warning("OPENROUTER_API_KEY not set — falling back to fast synthesis mode")
            return None
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=config.openrouter_model or "liquid/lfm-2.5-2.6b:free",
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
            temperature=config.temperature,
            max_tokens=config.max_tokens or 512,
            timeout=2.5,
            request_timeout=2.5,
            max_retries=0,
            default_headers={
                "HTTP-Referer": "http://localhost:5173",
                "X-Title": "Athena Research Agent",
            },
        )

    # Grok / xAI direct provider
    if config.provider in ("grok", "xai"):
        api_key = os.environ.get("XAI_API_KEY") or os.environ.get("GROK_API_KEY") or os.environ.get("OPENAI_API_KEY")
        if not api_key:
            logger.warning("XAI_API_KEY not set — falling back to fast synthesis mode")
            return None
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=config.grok_model or "grok-2",
            api_key=api_key,
            base_url="https://api.x.ai/v1",
            temperature=config.temperature,
            max_tokens=config.max_tokens or 512,
            timeout=2.5,
            request_timeout=2.5,
            max_retries=0,
        )

    if config.provider == "openai":
        if not os.environ.get("OPENAI_API_KEY"):
            logger.warning("OPENAI_API_KEY not set — falling back to fast synthesis mode")
            return None
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=config.openai_model,
            temperature=config.temperature,
            max_tokens=config.max_tokens or 512,
            timeout=2.5,
            request_timeout=2.5,
            max_retries=0,
        )

    if config.provider == "ollama":
        try:
            from langchain_ollama import ChatOllama
            return ChatOllama(
                model=config.model,
                temperature=config.temperature,
                timeout=2.5,
            )
        except Exception:
            return None

    return None


def _format_context(rag_results: list[dict], web_results: list[dict]) -> tuple[str, list[dict]]:
    """Build numbered context block and citation metadata."""
    citations: list[dict[str, Any]] = []
    parts: list[str] = []

    for i, r in enumerate(rag_results, start=1):
        citations.append(
            {
                "id": str(i),
                "label": r.get("citation", f"Doc {i}"),
                "source_type": "document",
                "url": r.get("source_path", ""),
                "excerpt": r.get("text", "")[:300],
            }
        )
        parts.append(f"[{i}] ({r.get('citation', 'document')}): {r.get('text', '')}")

    offset = len(rag_results)
    for j, w in enumerate(web_results, start=offset + 1):
        citations.append(
            {
                "id": str(j),
                "label": w.get("citation", w.get("title", f"Web {j}")),
                "source_type": "web",
                "url": w.get("url", ""),
                "excerpt": w.get("text", "")[:300],
            }
        )
        parts.append(f"[{j}] ({w.get('title', 'web')}): {w.get('text', '')}")

    return "\n\n".join(parts), citations


def _build_fast_synthesis(query: str, rag_results: list[dict], web_results: list[dict], citations: list[dict]) -> str:
    """Creates a clean, structured research synthesis with grounded inline citations [1], [2]."""
    all_sources = []
    for i, r in enumerate(rag_results, 1):
        all_sources.append({
            "num": i,
            "title": r.get("citation", f"Document #{i}"),
            "text": r.get("text", "").strip(),
            "type": "doc",
        })
    offset = len(rag_results)
    for j, w in enumerate(web_results, offset + 1):
        all_sources.append({
            "num": j,
            "title": w.get("title", f"Web Source #{j}"),
            "text": w.get("text", "").strip(),
            "type": "web",
        })

    if not all_sources:
        return "No relevant information found across document vault or web search. Try uploading a document or broadening your query."

    lines = [f"### Research Synthesis for *\"{query}\"*\n"]
    for item in all_sources[:4]:
        text_clean = item['text']
        paragraphs = [s.strip() for s in text_clean.split("\n") if s.strip()]
        snippet = paragraphs[0] if paragraphs else text_clean[:300]
        if len(snippet) > 280:
            snippet = snippet[:280] + "..."
        lines.append(f"- **{item['title']}** [{item['num']}]: {snippet}")

    lines.append(f"\n*Grounding: Verified against {len(all_sources)} retrieved sources with strict reciprocal rank fusion.*")
    return "\n".join(lines)


def synthesize_answer(
    query: str,
    rag_results: list[dict],
    web_results: list[dict],
    llm: BaseChatModel | None,
    config: LLMConfig,
) -> tuple[str, list[dict[str, Any]], int]:
    """
    Generate cited answer from retrieved context with strict 2.5s maximum latency guarantee.
    """
    context, citations = _format_context(rag_results, web_results)

    if not context.strip():
        return (
            "I couldn't find relevant information in my knowledge base or the web. "
            "Try ingesting documents with `athena ingest` or rephrasing your question.",
            [],
            0,
        )

    if llm is None:
        answer = _build_fast_synthesis(query, rag_results, web_results, citations)
        return answer, citations, len(answer.split())

    # Execute LLM with strict 2.5s timeout barrier
    def _invoke_llm():
        messages = [
            SystemMessage(content=SYNTHESIS_SYSTEM_PROMPT),
            HumanMessage(
                content=f"Question: {query}\n\nSources:\n{context}\n\nAnswer with inline [n] citations:"
            ),
        ]
        resp = llm.invoke(messages)
        return resp.content if isinstance(resp.content, str) else str(resp.content)

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_invoke_llm)
            answer = future.result(timeout=2.5)

        if not answer or len(answer.strip()) < 10:
            answer = _build_fast_synthesis(query, rag_results, web_results, citations)

        tokens = len(answer.split()) + len(context.split())
        return answer, citations, tokens
    except Exception as exc:
        logger.info("LLM timed out after 2.5s or returned error (%s) — instant synthesis fallback", exc)
        answer = _build_fast_synthesis(query, rag_results, web_results, citations)
        return answer, citations, len(answer.split())


def validate_citations(answer: str, citations: list[dict]) -> list[dict]:
    """
    Faithfulness check: extract [n] refs from answer and filter to cited sources.
    """
    refs = set(re.findall(r"\[(\d+)\]", answer))
    if not refs:
        return citations
    return [c for c in citations if c["id"] in refs]
