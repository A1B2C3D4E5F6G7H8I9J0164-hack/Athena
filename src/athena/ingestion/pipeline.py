"""
Ingestion pipeline factory.

Wires together: Discover → Load → Chunk → Embed → Store
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from athena.config.settings import AthenaConfig
from athena.embeddings.local_embedder import LocalEmbedder
from athena.ingestion.stages import (
    ChunkDocumentsStage,
    DiscoverDocumentsStage,
    EmbedChunksStage,
    LoadDocumentsStage,
    StoreChunksStage,
)
from athena.models import LoadedDocument
from athena.pipeline.base import PipelineOrchestrator, PipelineResult
from athena.storage.chroma_store import ChromaVectorStore


class IngestionPipeline:
    """High-level API for document ingestion."""

    def __init__(self, config: AthenaConfig) -> None:
        self.config = config
        self.embedder = LocalEmbedder(config.embeddings)
        self.vector_store = ChromaVectorStore(config)

        self.orchestrator = PipelineOrchestrator(
            stages=[
                DiscoverDocumentsStage(config),
                LoadDocumentsStage(config),
                ChunkDocumentsStage(config),
                EmbedChunksStage(self.embedder),
                StoreChunksStage(config),
            ],
            name="ingestion",
        )

    def run(self, files: list[Path] | None = None) -> PipelineResult[int]:
        context: dict[str, Any] = {"vector_store": self.vector_store}

        # LoadDocumentsStage needs doc hashes; capture loaded docs for registry
        original_run = self.orchestrator.stages[1].run  # LoadDocumentsStage

        def patched_run(paths, ctx):
            docs = original_run(paths, ctx)
            ctx["_loaded_docs_by_id"] = {d.source_id: d for d in docs}
            return docs

        self.orchestrator.stages[1].run = patched_run  # type: ignore[method-assign]

        return self.orchestrator.run(files or [], context)
