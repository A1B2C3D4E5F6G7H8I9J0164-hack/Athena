"""Document loaders — extract text + page metadata from raw files."""

from __future__ import annotations

import hashlib
import logging
from abc import ABC, abstractmethod
from pathlib import Path

from pypdf import PdfReader

from athena.models import DocumentPage, LoadedDocument

logger = logging.getLogger(__name__)


def compute_file_hash(path: Path) -> str:
    """SHA-256 fingerprint for incremental ingestion (skip unchanged files)."""
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(8192), b""):
            h.update(block)
    return h.hexdigest()


class BaseLoader(ABC):
    """Strategy interface — one loader per file type."""

    @abstractmethod
    def can_load(self, path: Path) -> bool:
        ...

    @abstractmethod
    def load(self, path: Path) -> LoadedDocument:
        ...


class PDFLoader(BaseLoader):
    """
    PDF loader using pypdf.

    Design decision: pypdf over unstructured.io for Phase 1.
    - pypdf is lightweight, no extra system dependencies.
    - Page boundaries are preserved natively (critical for citation metadata).
    - unstructured is better for complex layouts; we can swap loaders later
      without changing downstream pipeline stages (Open/Closed principle).
    """

    def can_load(self, path: Path) -> bool:
        return path.suffix.lower() == ".pdf"

    def load(self, path: Path) -> LoadedDocument:
        reader = PdfReader(str(path))
        pages: list[DocumentPage] = []

        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            if text.strip():
                pages.append(DocumentPage(text=text.strip(), page_number=i))

        logger.info("Loaded PDF '%s': %d non-empty pages", path.name, len(pages))
        return LoadedDocument(
            source_id=path.stem,
            source_path=str(path.resolve()),
            file_type="pdf",
            pages=pages,
            file_hash=compute_file_hash(path),
        )


class TextLoader(BaseLoader):
    """Plain text and markdown loader — treats entire file as page 0."""

    SUPPORTED = {".txt", ".md"}

    def can_load(self, path: Path) -> bool:
        return path.suffix.lower() in self.SUPPORTED

    def load(self, path: Path) -> LoadedDocument:
        text = path.read_text(encoding="utf-8", errors="replace").strip()
        pages = [DocumentPage(text=text, page_number=0)] if text else []

        logger.info("Loaded text file '%s': %d chars", path.name, len(text))
        return LoadedDocument(
            source_id=path.stem,
            source_path=str(path.resolve()),
            file_type=path.suffix.lstrip(".").lower(),
            pages=pages,
            file_hash=compute_file_hash(path),
        )


class LoaderRegistry:
    """Picks the right loader for a file extension."""

    def __init__(self) -> None:
        self._loaders: list[BaseLoader] = [PDFLoader(), TextLoader()]

    def load(self, path: Path) -> LoadedDocument:
        for loader in self._loaders:
            if loader.can_load(path):
                return loader.load(path)
        raise ValueError(f"No loader registered for file type: {path.suffix}")
