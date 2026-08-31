"""
FastAPI route handlers for Athena Research Agent.

Endpoints:
  POST /query              — Full agent run (JSON response)
  POST /query/stream       — SSE stream of agent steps + final answer
  POST /search             — Raw hybrid retrieval without LLM synthesis
  POST /documents/upload   — Upload & ingest documents into ChromaDB
  POST /documents/url      — Scrape & ingest web URL
  DELETE /documents/{id}   — Delete document from registry & vector store
  GET  /documents/{id}/chunks — Get chunks for specific document
  POST /feedback           — Log user satisfaction feedback
  GET  /documents          — List indexed documents
  GET  /history            — Query audit trail
  GET  /sessions           — Session list
  GET  /health             — System health & status
  GET  /metrics            — Aggregated stats & retrieval precision
"""

from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from sse_starlette.sse import EventSourceResponse

from athena.api.database import QueryLogger
from athena.api.documents import delete_document, get_document_chunks, ingest_url, list_documents, save_and_ingest
from athena.api.schemas import (
  ChunkDetail,
  DeleteDocumentResponse,
  DocumentChunksResponse,
  DocumentInfo,
  FeedbackRequest,
  FeedbackResponse,
  HealthResponse,
  HistoryItem,
  MetricsResponse,
  QueryRequest,
  QueryResponse,
  SearchRequest,
  SearchResponse,
  SearchResultItem,
  UploadResponse,
  UrlIngestRequest,
)
from athena.api.utils import get_doc_count
from athena.config.settings import load_config
from athena.eval.metrics import load_qa_pairs, run_evaluation
from athena.retrieval.hybrid_pipeline import HybridRetrievalPipeline

logger = logging.getLogger(__name__)

router = APIRouter()

# Cached precision to avoid re-evaluating on every metrics call
_CACHED_PRECISION: float | None = None


@router.post("/query", response_model=QueryResponse)
async def query_endpoint(request: Request, body: QueryRequest) -> QueryResponse:
  """Run the full Athena research agent pipeline synchronously."""
  agent = request.app.state.agent
  query_logger: QueryLogger = request.app.state.query_logger
  config = request.app.state.config

  history = [{"role": m.role, "content": m.content} for m in body.history]
  override = (
      None if body.route_override in (None, "auto") else body.route_override
  )

  result = agent.run(
      query=body.query,
      session_id=body.session_id,
      history=history,
      route_override=override,
  )

  if config.logging.enabled:
    query_logger.log_query(result["session_id"], body.query, result)

  return QueryResponse(**result)


@router.post("/query/stream")
async def query_stream(
    request: Request, body: QueryRequest
) -> EventSourceResponse:
  """SSE stream — emits agent steps in real time, then final answer."""
  agent = request.app.state.agent
  query_logger = request.app.state.query_logger
  config = request.app.state.config
  history = [{"role": m.role, "content": m.content} for m in body.history]
  override = (
      None if body.route_override in (None, "auto") else body.route_override
  )

  async def event_generator() -> AsyncGenerator[dict, None]:
    for event in agent.run_stream(
        query=body.query,
        session_id=body.session_id,
        history=history,
        route_override=override,
    ):
      if event["type"] == "done":
        data = event["data"]
        if config.logging.enabled:
          query_logger.log_query(data["session_id"], body.query, data)
        yield {"event": "done", "data": json.dumps(data)}
      elif event["type"] == "step":
        yield {"event": "step", "data": json.dumps(event["step"])}
      elif event["type"] == "error":
        yield {
            "event": "error",
            "data": json.dumps({"message": event["message"]}),
        }

  return EventSourceResponse(event_generator())


@router.post("/search", response_model=SearchResponse)
async def search_raw(request: Request, body: SearchRequest) -> SearchResponse:
  """Raw hybrid retrieval — no LLM synthesis. Useful for debugging RAG."""
  import time

  agent = request.app.state.agent
  pipeline = agent.rag_tool.pipeline
  start = time.perf_counter()
  result = pipeline.retrieve(body.query)
  elapsed = (time.perf_counter() - start) * 1000

  results = result.results[: body.top_k]

  return SearchResponse(
      query=body.query,
      results=[
          SearchResultItem(
              chunk_id=r.chunk_id,
              text=r.text,
              citation=r.citation_label(),
              rerank_score=r.rerank_score,
          )
          for r in results
      ],
      elapsed_ms=round(elapsed, 2),
  )


@router.post("/documents/upload", response_model=UploadResponse)
async def upload_document(
    request: Request, file: UploadFile = File(...)
) -> UploadResponse:
  """Upload PDF/TXT/MD and ingest into the vector store."""
  config = request.app.state.config
  agent = request.app.state.agent

  try:
    filename, chunks = await save_and_ingest(file, config)
  except ValueError as exc:
    raise HTTPException(status_code=400, detail=str(exc)) from exc
  except Exception as exc:
    raise HTTPException(
        status_code=500, detail=f"Ingestion failed: {exc}"
    ) from exc

  agent.invalidate_cache()

  return UploadResponse(
      filename=filename,
      chunks_stored=chunks,
      message=f"Ingested {chunks} chunks from {filename}",
  )


@router.post("/documents/url", response_model=UploadResponse)
async def upload_url(request: Request, body: UrlIngestRequest) -> UploadResponse:
  """Scrape and ingest content from a public web URL."""
  config = request.app.state.config
  agent = request.app.state.agent

  try:
    filename, chunks = await ingest_url(body.url, config)
  except ValueError as exc:
    raise HTTPException(status_code=400, detail=str(exc)) from exc
  except Exception as exc:
    raise HTTPException(
        status_code=500, detail=f"URL scraping failed: {exc}"
    ) from exc

  agent.invalidate_cache()

  return UploadResponse(
      filename=filename,
      chunks_stored=chunks,
      message=f"Scraped and ingested {chunks} chunks from {filename}",
  )


@router.delete("/documents/{source_id}", response_model=DeleteDocumentResponse)
async def delete_doc(request: Request, source_id: str) -> DeleteDocumentResponse:
  """Delete a document and all its chunks from the registry and vector store."""
  config = request.app.state.config
  agent = request.app.state.agent

  success, msg = delete_document(source_id, config)
  if not success:
    raise HTTPException(status_code=404, detail=msg)

  agent.invalidate_cache()
  return DeleteDocumentResponse(
      status="ok",
      source_id=source_id,
      message=msg,
  )


@router.get(
    "/documents/{source_id}/chunks", response_model=DocumentChunksResponse
)
async def get_doc_chunks(
    request: Request, source_id: str
) -> DocumentChunksResponse:
  """Retrieve all indexed chunks and metadata for a specific document."""
  config = request.app.state.config
  chunks_data = get_document_chunks(source_id, config)

  return DocumentChunksResponse(
      source_id=source_id,
      total_chunks=len(chunks_data),
      chunks=[ChunkDetail(**c) for c in chunks_data],
  )


@router.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(
    request: Request, body: FeedbackRequest
) -> FeedbackResponse:
  """Record user rating/feedback for answer quality evaluation."""
  query_logger: QueryLogger = request.app.state.query_logger
  query_logger.log_feedback(
      query=body.query,
      answer=body.answer,
      rating=body.rating,
      session_id=body.session_id,
      comment=body.comment,
  )
  return FeedbackResponse(
      status="ok",
      message="Thank you for your feedback!",
  )


@router.get("/documents", response_model=list[DocumentInfo])
async def get_documents(request: Request) -> list[DocumentInfo]:
  config = request.app.state.config
  return [DocumentInfo(**d) for d in list_documents(config)]


@router.get("/history", response_model=list[HistoryItem])
async def get_history(request: Request, limit: int = 50) -> list[HistoryItem]:
  query_logger = request.app.state.query_logger
  return [HistoryItem(**row) for row in query_logger.get_history(limit)]


@router.get("/sessions")
async def get_sessions(request: Request, limit: int = 20) -> list[dict]:
  query_logger = request.app.state.query_logger
  return query_logger.get_sessions(limit)


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
  config = request.app.state.config
  return HealthResponse(
      status="ok",
      documents_indexed=get_doc_count(config),
      llm_provider=config.llm.provider,
  )


@router.get("/metrics", response_model=MetricsResponse)
async def metrics(request: Request) -> MetricsResponse:
  """Aggregated query stats + fast cached retrieval precision."""
  global _CACHED_PRECISION
  query_logger = request.app.state.query_logger
  stats = query_logger.get_metrics()

  config = request.app.state.config
  doc_count = get_doc_count(config)
  note = "Operational metrics active."

  if _CACHED_PRECISION is None and doc_count > 0:
    qa_path = config.data_path / "eval" / "qa_pairs.json"
    if qa_path.exists():
      try:
        agent = request.app.state.agent
        qa_pairs = load_qa_pairs(qa_path)
        eval_result = run_evaluation(
            agent.rag_tool.pipeline, qa_pairs[:5], k_values=[1]
        )
        _CACHED_PRECISION = eval_result.precision_at_k.get(1)
      except Exception:
        pass

  precision_at_1 = _CACHED_PRECISION

  return MetricsResponse(
      total_queries=stats["total_queries"],
      avg_latency_ms=stats["avg_latency_ms"],
      avg_faithfulness=stats["avg_faithfulness"],
      route_distribution=stats["route_distribution"],
      total_tokens_used=stats["total_tokens"],
      retrieval_precision_at_1=precision_at_1,
      note=note,
  )
