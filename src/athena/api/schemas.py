"""Pydantic schemas for FastAPI request/response."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str
    content: str


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=4000)
    session_id: str | None = None
    history: list[ChatMessage] = Field(default_factory=list)
    route_override: str | None = Field(None, description="Force route: rag | web | both | auto")


class CitationResponse(BaseModel):
    id: str
    label: str
    source_type: str
    url: str
    excerpt: str


class AgentStep(BaseModel):
    name: str
    detail: str
    status: str = "done"


class QueryResponse(BaseModel):
    answer: str
    citations: list[CitationResponse]
    sources_used: list[str]
    route: str
    plan: str
    steps: list[AgentStep]
    latency_ms: float
    tokens_used: int
    session_id: str
    faithfulness_score: float | None = None


class DocumentInfo(BaseModel):
    source_id: str
    source_path: str
    file_type: str
    chunk_count: int
    ingested_at: str


class UploadResponse(BaseModel):
    filename: str
    chunks_stored: int
    message: str


class HistoryItem(BaseModel):
    id: int
    session_id: str
    query: str
    answer: str
    route: str
    latency_ms: float
    created_at: str


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: int = Field(5, ge=1, le=20)


class SearchResultItem(BaseModel):
    chunk_id: str
    text: str
    citation: str
    rerank_score: float | None = None


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResultItem]
    elapsed_ms: float


class HealthResponse(BaseModel):
    status: str
    documents_indexed: int
    llm_provider: str


class MetricsResponse(BaseModel):
    total_queries: int = 0
    avg_latency_ms: float = 0.0
    avg_faithfulness: float = 1.0
    route_distribution: dict[str, int] = Field(default_factory=dict)
    total_tokens_used: int = 0
    retrieval_precision_at_1: float | None = None
    note: str = ""



class UrlIngestRequest(BaseModel):
    url: str = Field(..., min_length=4)


class ChunkDetail(BaseModel):
    chunk_id: str
    text: str
    page_number: int
    source_id: str


class DocumentChunksResponse(BaseModel):
    source_id: str
    total_chunks: int
    chunks: list[ChunkDetail]


class FeedbackRequest(BaseModel):
    session_id: str | None = None
    query: str
    answer: str
    rating: int = Field(..., ge=-1, le=1)  # 1 for thumbs up, -1 for thumbs down
    comment: str | None = None


class FeedbackResponse(BaseModel):
    status: str
    message: str


class DeleteDocumentResponse(BaseModel):
    source_id: str
    deleted: bool
    message: str

