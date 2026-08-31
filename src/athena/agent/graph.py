"""
LangGraph agent — explicit state machine for research queries.

Graph flow:
  plan → route → retrieve / search / parallel hybrid → synthesize → cite → respond

Design decision: LangGraph over a simple while-loop agent.
- Each node is a pure function on AgentState — testable in isolation.
- State transitions are explicit.
- Memory via messages list persists across turns in a session.
- Steps array feeds the animated UI pipeline indicator.
- Parallel execution for multi-source hybrid search cuts latency in half.
"""

from __future__ import annotations

import concurrent.futures
import json
import logging
import time
import uuid
from typing import Any, Generator

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from athena.agent.router import build_plan, route_query
from athena.agent.state import AgentState
from athena.agent.synthesizer import get_llm, synthesize_answer, validate_citations
from athena.eval.faithfulness import check_faithfulness
from athena.agent.tools import RAGSearchTool, web_search
from athena.config.settings import AthenaConfig
from athena.storage.chroma_store import ChromaVectorStore

logger = logging.getLogger(__name__)


def _add_step(state: AgentState, name: str, detail: str, status: str = "done") -> list[dict]:
    steps = list(state.get("steps", []))
    steps.append({"name": name, "detail": detail, "status": status})
    return steps


class AthenaAgent:
    """Wraps the compiled LangGraph with session memory."""

    def __init__(self, config: AthenaConfig) -> None:
        self.config = config
        self.rag_tool = RAGSearchTool(config)
        self.llm = get_llm(config.llm)
        self.memory = MemorySaver()
        self.graph = self._build_graph()
        self._has_docs: bool | None = None

    def _check_has_docs(self) -> bool:
        if self._has_docs is None:
            store = ChromaVectorStore(self.config)
            self._has_docs = store.count > 0
        return self._has_docs

    def _build_graph(self):
        graph = StateGraph(AgentState)

        graph.add_node("plan", self._plan_node)
        graph.add_node("route", self._route_node)
        graph.add_node("retrieve", self._retrieve_node)
        graph.add_node("search_web", self._web_node)
        graph.add_node("parallel_both", self._parallel_both_node)
        graph.add_node("synthesize", self._synthesize_node)
        graph.add_node("cite", self._cite_node)
        graph.add_node("respond", self._respond_node)

        graph.set_entry_point("plan")
        graph.add_edge("plan", "route")
        graph.add_conditional_edges(
            "route",
            self._after_route,
            {"retrieve": "retrieve", "search_web": "search_web", "both": "parallel_both"},
        )
        graph.add_edge("retrieve", "synthesize")
        graph.add_edge("search_web", "synthesize")
        graph.add_edge("parallel_both", "synthesize")
        graph.add_edge("synthesize", "cite")
        graph.add_edge("cite", "respond")
        graph.add_edge("respond", END)

        return graph.compile(checkpointer=self.memory)

    def _after_route(self, state: AgentState) -> str:
        route = state.get("route", "rag")
        if route == "both":
            return "both"
        if route == "web":
            return "search_web"
        return "retrieve"

    def _plan_node(self, state: AgentState) -> dict[str, Any]:
        query = state.get("query", "")
        return {
            "steps": _add_step(state, "Plan", f"Analyzing query: {query[:80]}"),
        }

    def _route_node(self, state: AgentState) -> dict[str, Any]:
        query = state.get("query", "")
        override = state.get("route_override", "")
        if override and override in ("rag", "web", "both"):
            route = override  # type: ignore[assignment]
        else:
            route = route_query(query, self.config.agent, self._check_has_docs())
        plan = build_plan(query, route)
        return {
            "route": route,
            "plan": plan,
            "steps": _add_step(state, "Route", f"Decision: {route.upper()} — {plan}"),
        }

    def invalidate_cache(self) -> None:
        """Call after document upload to refresh doc count and BM25 index."""
        self._has_docs = None
        self.rag_tool.invalidate_bm25_cache()

    def _retrieve_node(self, state: AgentState) -> dict[str, Any]:
        query = state.get("query", "")
        results = self.rag_tool.search(query)
        detail = f"Found {len(results)} chunks from local KB"
        return {
            "rag_results": results,
            "steps": _add_step(state, "Retrieve", detail),
        }

    def _web_node(self, state: AgentState) -> dict[str, Any]:
        query = state.get("query", "")
        results = web_search(query, max_results=self.config.agent.max_web_results)
        detail = f"Found {len(results)} web results"
        return {
            "web_results": results,
            "steps": _add_step(state, "Search", detail),
        }

    def _parallel_both_node(self, state: AgentState) -> dict[str, Any]:
        """Execute local RAG retrieval and web search concurrently in parallel."""
        query = state.get("query", "")
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            future_rag = executor.submit(self.rag_tool.search, query)
            future_web = executor.submit(
                web_search, query, self.config.agent.max_web_results
            )
            rag_results = future_rag.result()
            web_results = future_web.result()

        detail = f"Retrieved {len(rag_results)} local chunks + {len(web_results)} web results (parallel)"
        return {
            "rag_results": rag_results,
            "web_results": web_results,
            "steps": _add_step(state, "Retrieve", detail),
        }

    def _synthesize_node(self, state: AgentState) -> dict[str, Any]:
        query = state.get("query", "")
        rag = state.get("rag_results", [])
        web = state.get("web_results", [])

        answer, citations, tokens = synthesize_answer(
            query, rag, web, self.llm, self.config.llm
        )
        return {
            "draft_answer": answer,
            "citations": citations,
            "tokens_used": tokens,
            "steps": _add_step(state, "Synthesize", f"Generated answer ({tokens} tokens est.)"),
        }

    def _cite_node(self, state: AgentState) -> dict[str, Any]:
        answer = state.get("draft_answer", "")
        citations = state.get("citations", [])
        validated = validate_citations(answer, citations)

        sources_used = []
        for c in validated:
            if c["source_type"] == "web":
                sources_used.append(c.get("url", c["label"]))
            else:
                sources_used.append(c.get("label", ""))

        return {
            "final_answer": answer,
            "citations": validated,
            "sources_used": sources_used,
            "steps": _add_step(
                state, "Cite", f"Validated {len(validated)} citation(s)"
            ),
        }

    def _respond_node(self, state: AgentState) -> dict[str, Any]:
        answer = state.get("final_answer", "")
        return {
            "messages": [AIMessage(content=answer)],
            "steps": _add_step(state, "Respond", "Answer delivered"),
        }

    def run(
        self,
        query: str,
        session_id: str | None = None,
        history: list[dict] | None = None,
        route_override: str | None = None,
    ) -> dict[str, Any]:
        """
        Execute the full agent pipeline for one query.

        Returns structured response for API layer and UI.
        """
        start = time.perf_counter()
        session_id = session_id or str(uuid.uuid4())

        messages = []
        if history:
            for msg in history:
                if msg["role"] == "user":
                    messages.append(HumanMessage(content=msg["content"]))
                else:
                    messages.append(AIMessage(content=msg["content"]))
        messages.append(HumanMessage(content=query))

        initial_state: AgentState = {
            "messages": messages,
            "query": query,
            "session_id": session_id,
            "plan": "",
            "route": "rag",
            "route_override": route_override or "",
            "rag_results": [],
            "web_results": [],
            "draft_answer": "",
            "final_answer": "",
            "citations": [],
            "sources_used": [],
            "steps": [],
            "tokens_used": 0,
            "error": "",
        }

        config = {"configurable": {"thread_id": session_id}}

        try:
            final_state = self.graph.invoke(initial_state, config=config)
        except Exception as exc:
            logger.exception("Agent run failed")
            elapsed_ms = (time.perf_counter() - start) * 1000
            return {
                "answer": f"Agent error: {exc}",
                "citations": [],
                "sources_used": [],
                "route": "error",
                "plan": "",
                "steps": [],
                "latency_ms": round(elapsed_ms, 2),
                "tokens_used": 0,
                "session_id": session_id,
                "faithfulness_score": None,
            }

        elapsed_ms = (time.perf_counter() - start) * 1000

        answer = final_state.get("final_answer", "")
        citations = final_state.get("citations", [])
        faith = check_faithfulness(answer, [c["id"] for c in citations])

        return {
            "answer": answer,
            "citations": citations,
            "sources_used": final_state.get("sources_used", []),
            "route": final_state.get("route", ""),
            "plan": final_state.get("plan", ""),
            "steps": final_state.get("steps", []),
            "latency_ms": round(elapsed_ms, 2),
            "tokens_used": final_state.get("tokens_used", 0),
            "session_id": session_id,
            "faithfulness_score": round(faith.faithfulness_rate, 4) if faith else None,
        }

    def run_stream(
        self,
        query: str,
        session_id: str | None = None,
        history: list[dict] | None = None,
        route_override: str | None = None,
    ) -> Generator[dict[str, Any], None, None]:
        """
        Stream agent execution events as nodes complete.

        Emits:
        - {"type": "step", "step": {"name": ..., "detail": ..., "status": ...}}
        - {"type": "done", "data": <full response dict>}
        """
        start = time.perf_counter()
        session_id = session_id or str(uuid.uuid4())

        messages = []
        if history:
            for msg in history:
                if msg["role"] == "user":
                    messages.append(HumanMessage(content=msg["content"]))
                else:
                    messages.append(AIMessage(content=msg["content"]))
        messages.append(HumanMessage(content=query))

        initial_state: AgentState = {
            "messages": messages,
            "query": query,
            "session_id": session_id,
            "plan": "",
            "route": "rag",
            "route_override": route_override or "",
            "rag_results": [],
            "web_results": [],
            "draft_answer": "",
            "final_answer": "",
            "citations": [],
            "sources_used": [],
            "steps": [],
            "tokens_used": 0,
            "error": "",
        }

        config = {"configurable": {"thread_id": session_id}}
        last_state = dict(initial_state)

        for event in self.graph.stream(initial_state, config=config):
            for node_name, node_output in event.items():
                if isinstance(node_output, dict):
                    last_state.update(node_output)
                    steps = node_output.get("steps", [])
                    if steps:
                        yield {"type": "step", "step": steps[-1]}

        elapsed_ms = (time.perf_counter() - start) * 1000
        answer = last_state.get("final_answer", "")
        citations = last_state.get("citations", [])
        faith = check_faithfulness(answer, [c["id"] for c in citations])

        yield {
            "type": "done",
            "data": {
                "answer": answer,
                "citations": citations,
                "sources_used": last_state.get("sources_used", []),
                "route": last_state.get("route", ""),
                "plan": last_state.get("plan", ""),
                "steps": last_state.get("steps", []),
                "latency_ms": round(elapsed_ms, 2),
                "tokens_used": last_state.get("tokens_used", 0),
                "session_id": session_id,
                "faithfulness_score": round(faith.faithfulness_rate, 4) if faith else None,
            },
        }
