"""
Agent state schema for LangGraph.

Design decision: TypedDict state with explicit fields per pipeline stage.
Each node reads/writes specific keys — makes the graph debuggable and
interview-explainable ("here's exactly what each state transition adds").
"""

from __future__ import annotations

from typing import Annotated, Any, Literal, TypedDict

from langgraph.graph.message import add_messages


RouteDecision = Literal["rag", "web", "both"]


class Citation(TypedDict):
    id: str
    label: str
    source_type: Literal["document", "web"]
    url: str
    excerpt: str


class AgentState(TypedDict):
    # Conversational memory — LangGraph merges messages across turns
    messages: Annotated[list, add_messages]

    # Current user query (may differ from last message after reformulation)
    query: str
    session_id: str

    # Stage outputs (populated sequentially through the graph)
    plan: str
    route: RouteDecision
    route_override: str
    rag_results: list[dict[str, Any]]
    web_results: list[dict[str, Any]]
    draft_answer: str
    final_answer: str
    citations: list[Citation]
    sources_used: list[str]

    # Observability — surfaced to UI as animated step indicators
    steps: list[dict[str, Any]]
    tokens_used: int
    error: str
