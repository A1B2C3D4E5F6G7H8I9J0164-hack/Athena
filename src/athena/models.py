"""Shared data models used across ingestion and retrieval pipelines."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class DocumentPage:
    """One page (or logical section) extracted from a source file."""

    text: str
    page_number: int
    section: str = ""


@dataclass
class LoadedDocument:
    """Output of a document loader — raw text split into pages with source metadata."""

    source_id: str
    source_path: str
    file_type: str
    pages: list[DocumentPage]
    file_hash: str = ""


@dataclass
class Chunk:
    """
    Atomic unit stored in the vector DB.

    Metadata fields (source, page, section) are critical for citations in Phase 2.
    """

    chunk_id: str
    text: str
    source_id: str
    source_path: str
    page_number: int
    section: str
    chunk_index: int
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_metadata_dict(self) -> dict[str, Any]:
        """Flatten chunk fields for ChromaDB metadata storage."""
        return {
            "source_id": self.source_id,
            "source_path": self.source_path,
            "page_number": self.page_number,
            "section": self.section,
            "chunk_index": self.chunk_index,
            **self.metadata,
        }


@dataclass
class RetrievalResult:
    """Single retrieved chunk with scores from each retrieval stage."""

    chunk_id: str
    text: str
    metadata: dict[str, Any]
    dense_score: float | None = None
    sparse_score: float | None = None
    rrf_score: float | None = None
    rerank_score: float | None = None

    @property
    def source_path(self) -> str:
        return str(self.metadata.get("source_path", ""))

    @property
    def page_number(self) -> int:
        return int(self.metadata.get("page_number", -1))

    def citation_label(self) -> str:
        """Human-readable citation string for Phase 2 answer formatting."""
        page = self.page_number
        source = self.source_path.split("/")[-1] if self.source_path else "unknown"
        if page >= 0:
            return f"{source}, p.{page + 1}"
        return source
