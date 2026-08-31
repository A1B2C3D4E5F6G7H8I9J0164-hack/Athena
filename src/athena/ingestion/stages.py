"""Ingestion pipeline stages — composed by IngestionPipeline."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from athena.config.settings import AthenaConfig
from athena.embeddings.local_embedder import LocalEmbedder
from athena.ingestion.chunker import Chunker
from athena.ingestion.loaders import LoaderRegistry
from athena.ingestion.registry import DocumentRegistry, RegistryEntry
from athena.models import Chunk, LoadedDocument
from athena.pipeline.base import PipelineStage
from athena.storage.chroma_store import ChromaVectorStore

logger = logging.getLogger(__name__)


class DiscoverDocumentsStage(PipelineStage[list[Path], list[Path]]):
    """Find ingestible files in the raw documents directory."""

    name = "discover_documents"

    def __init__(self, config: AthenaConfig):
        self.config = config

    def run(self, input_data: list[Path], context: dict[str, Any]) -> list[Path]:
        extensions = set(self.config.ingestion.supported_extensions)
        if input_data:
            files: list[Path] = []
            for p in input_data:
                if p.is_file() and p.suffix.lower() in extensions:
                    files.append(p)
                elif p.is_dir():
                    files.extend(
                        sorted(f for f in p.rglob("*") if f.is_file() and f.suffix.lower() in extensions)
                    )
        else:
            raw_dir = self.config.raw_docs_path
            raw_dir.mkdir(parents=True, exist_ok=True)
            files = sorted(
                p for p in raw_dir.rglob("*") if p.is_file() and p.suffix.lower() in extensions
            )

        context["discover_documents_metadata"] = {"file_count": len(files)}
        logger.info("Discovered %d documents to ingest", len(files))
        return files


class LoadDocumentsStage(PipelineStage[list[Path], list[LoadedDocument]]):
    """Load raw files into structured LoadedDocument objects."""

    name = "load_documents"

    def __init__(self, config: AthenaConfig):
        self.config = config
        self.loader = LoaderRegistry()
        self.registry = DocumentRegistry(config.registry_path)

    def run(self, input_data: list[Path], context: dict[str, Any]) -> list[LoadedDocument]:
        store: ChromaVectorStore = context["vector_store"]
        docs: list[LoadedDocument] = []
        skipped = 0

        for path in input_data:
            doc = self.loader.load(path)

            if self.config.ingestion.incremental and self.registry.is_unchanged(
                doc.source_id, doc.file_hash
            ):
                logger.info("Skipping unchanged document: %s", path.name)
                skipped += 1
                continue

            # Remove stale chunks before re-ingesting modified files
            store.delete_by_source(doc.source_id)
            docs.append(doc)

        context["load_documents_metadata"] = {
            "loaded": len(docs),
            "skipped_unchanged": skipped,
        }
        return docs


class ChunkDocumentsStage(PipelineStage[list[LoadedDocument], list[Chunk]]):
    """Split loaded documents into overlapping chunks with metadata."""

    name = "chunk_documents"

    def __init__(self, config: AthenaConfig):
        self.chunker = Chunker(config.ingestion.chunk)

    def run(self, input_data: list[LoadedDocument], context: dict[str, Any]) -> list[Chunk]:
        all_chunks: list[Chunk] = []
        for doc in input_data:
            chunks = self.chunker.chunk_document(doc)
            all_chunks.extend(chunks)
            logger.info("  %s → %d chunks", doc.source_id, len(chunks))

        context["chunk_documents_metadata"] = {"total_chunks": len(all_chunks)}
        return all_chunks


class EmbedChunksStage(PipelineStage[list[Chunk], tuple[list[Chunk], Any]]):
    """Generate embedding vectors for all chunks."""

    name = "embed_chunks"

    def __init__(self, embedder: LocalEmbedder):
        self.embedder = embedder

    def run(
        self, input_data: list[Chunk], context: dict[str, Any]
    ) -> tuple[list[Chunk], Any]:
        if not input_data:
            context["embed_chunks_metadata"] = {"embedded": 0}
            return [], None

        texts = [c.text for c in input_data]
        embeddings = self.embedder.embed_documents(texts)

        context["embed_chunks_metadata"] = {
            "embedded": len(input_data),
            "dimension": self.embedder.dimension,
        }
        return input_data, embeddings


class StoreChunksStage(PipelineStage[tuple[list[Chunk], Any], int]):
    """Persist chunks + embeddings to ChromaDB and update the document registry."""

    name = "store_chunks"

    def __init__(self, config: AthenaConfig):
        self.config = config
        self.registry = DocumentRegistry(config.registry_path)

    def run(self, input_data: tuple[list[Chunk], Any], context: dict[str, Any]) -> int:
        chunks, embeddings = input_data
        store: ChromaVectorStore = context["vector_store"]

        if not chunks:
            context["store_chunks_metadata"] = {"stored": 0}
            return 0

        stored = store.upsert_chunks(chunks, embeddings)

        # Group chunks by source for registry update
        by_source: dict[str, list[Chunk]] = {}
        for chunk in chunks:
            by_source.setdefault(chunk.source_id, []).append(chunk)

        loaded_docs: dict[str, LoadedDocument] = context.get("_loaded_docs_by_id", {})
        for source_id, source_chunks in by_source.items():
            doc = loaded_docs.get(source_id)
            self.registry.register(
                RegistryEntry(
                    source_id=source_id,
                    source_path=source_chunks[0].source_path,
                    file_hash=doc.file_hash if doc else "",
                    file_type=doc.file_type if doc else "unknown",
                    chunk_count=len(source_chunks),
                )
            )

        self.registry.save()
        context["store_chunks_metadata"] = {"stored": stored}
        return stored
