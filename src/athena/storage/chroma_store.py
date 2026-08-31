"""
ChromaDB vector store wrapper.

Design decision: ChromaDB over FAISS/Pinecone for Phase 1.
- Fully local, persistent, no API key.
- Built-in metadata filtering (useful in Phase 2 for source-scoped queries).
- Trade-off: not as fast as FAISS at millions of vectors, but fine for portfolio scale.
"""

from __future__ import annotations

import logging
from typing import Sequence

import chromadb
import numpy as np

from athena.config.settings import AthenaConfig
from athena.models import Chunk, RetrievalResult

logger = logging.getLogger(__name__)


class ChromaVectorStore:
    """Manages document chunk storage and dense similarity search."""

    def __init__(self, config: AthenaConfig) -> None:
        self.config = config
        config.persist_path.mkdir(parents=True, exist_ok=True)

        self.client = chromadb.PersistentClient(path=str(config.persist_path))
        self.collection = self.client.get_or_create_collection(
            name=config.vector_store.collection_name,
            metadata={"hnsw:space": "cosine"},
        )
        logger.info(
            "ChromaDB collection '%s' ready (%d existing chunks)",
            config.vector_store.collection_name,
            self.collection.count(),
        )

    @property
    def count(self) -> int:
        return self.collection.count()

    def upsert_chunks(
        self,
        chunks: Sequence[Chunk],
        embeddings: np.ndarray,
    ) -> int:
        """Insert or update chunks with their embedding vectors."""
        if not chunks:
            return 0

        ids = [c.chunk_id for c in chunks]
        documents = [c.text for c in chunks]
        metadatas = [c.to_metadata_dict() for c in chunks]

        self.collection.upsert(
            ids=ids,
            embeddings=embeddings.tolist(),
            documents=documents,
            metadatas=metadatas,
        )
        logger.info("Upserted %d chunks into ChromaDB", len(chunks))
        return len(chunks)

    def delete_by_source(self, source_id: str) -> None:
        """Remove all chunks belonging to a source (for re-ingestion)."""
        existing = self.collection.get(where={"source_id": source_id})
        if existing["ids"]:
            self.collection.delete(ids=existing["ids"])
            logger.info("Deleted %d chunks for source '%s'", len(existing["ids"]), source_id)

    def dense_search(
        self,
        query_embedding: np.ndarray,
        top_k: int,
    ) -> list[RetrievalResult]:
        """Cosine similarity search against stored embeddings."""
        if self.count == 0:
            return []

        results = self.collection.query(
            query_embeddings=[query_embedding.tolist()],
            n_results=min(top_k, self.count),
            include=["documents", "metadatas", "distances"],
        )

        output: list[RetrievalResult] = []
        for i in range(len(results["ids"][0])):
            # Chroma returns distance; convert to similarity for readability
            distance = results["distances"][0][i]
            similarity = 1.0 - distance

            output.append(
                RetrievalResult(
                    chunk_id=results["ids"][0][i],
                    text=results["documents"][0][i],
                    metadata=results["metadatas"][0][i],
                    dense_score=similarity,
                )
            )
        return output

    def get_all_documents(self) -> tuple[list[str], list[str], list[dict]]:
        """Fetch all stored documents for BM25 index building."""
        if self.count == 0:
            return [], [], []

        data = self.collection.get(include=["documents", "metadatas"])
        return data["ids"], data["documents"], data["metadatas"]
