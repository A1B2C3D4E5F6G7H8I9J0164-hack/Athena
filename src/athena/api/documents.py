"""Document upload and listing helpers."""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import UploadFile

from athena.config.settings import AthenaConfig
from athena.ingestion.pipeline import IngestionPipeline
from athena.ingestion.registry import DocumentRegistry

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md"}


async def save_and_ingest(
    file: UploadFile,
    config: AthenaConfig,
) -> tuple[str, int]:
    """
    Save uploaded file to data/raw/ and run ingestion pipeline.

    Returns (filename, chunks_stored).
    """
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Unsupported file type: {ext}. Allowed: {ALLOWED_EXTENSIONS}")

    raw_dir = config.raw_docs_path
    raw_dir.mkdir(parents=True, exist_ok=True)
    dest = raw_dir / (file.filename or f"upload{ext}")

    content = await file.read()
    dest.write_bytes(content)
    logger.info("Saved upload to %s (%d bytes)", dest, len(content))

    pipeline = IngestionPipeline(config)
    result = pipeline.run([dest])
    return dest.name, result.data


def list_documents(config: AthenaConfig) -> list[dict]:
    registry = DocumentRegistry(config.registry_path)
    return [
        {
            "source_id": e.source_id,
            "source_path": e.source_path,
            "file_type": e.file_type,
            "chunk_count": e.chunk_count,
            "ingested_at": e.ingested_at,
        }
        for e in registry.list_entries()
    ]


def delete_document(source_id: str, config: AthenaConfig) -> tuple[bool, str]:
    """Delete document from ChromaDB vector store, registry, and disk."""
    from athena.storage.chroma_store import ChromaVectorStore

    try:
        store = ChromaVectorStore(config)
        store.delete_by_source(source_id)

        registry = DocumentRegistry(config.registry_path)
        registry.remove(source_id)
        registry.save()

        # Attempt to remove raw file if in raw_docs_path
        raw_path = config.raw_docs_path / source_id
        if raw_path.exists():
            try:
                raw_path.unlink()
            except OSError:
                pass

        return True, f"Document '{source_id}' successfully removed from vector store and registry."
    except Exception as e:
        logger.exception("Failed to delete document %s", source_id)
        return False, str(e)


def get_document_chunks(source_id: str, config: AthenaConfig) -> list[dict]:
    """Retrieve all chunks belonging to a document from ChromaDB."""
    from athena.storage.chroma_store import ChromaVectorStore

    store = ChromaVectorStore(config)
    results = store.collection.get(where={"source_id": source_id}, include=["documents", "metadatas"])
    chunks = []
    if results and results.get("ids"):
        for i, cid in enumerate(results["ids"]):
            text = results["documents"][i] if results.get("documents") else ""
            meta = results["metadatas"][i] if results.get("metadatas") else {}
            chunks.append({
                "chunk_id": cid,
                "text": text,
                "page_number": int(meta.get("page_number", 0)),
                "source_id": meta.get("source_id", source_id),
            })
    return chunks


async def ingest_url(url: str, config: AthenaConfig) -> tuple[str, int]:
    """Fetch text from a web URL and ingest into hybrid RAG pipeline."""
    import re
    import urllib.request
    from urllib.parse import urlparse

    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Athena Research Agent; +https://athena.ai)"}
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        html = response.read().decode("utf-8", errors="replace")

    # Basic clean of script, style, html tags
    clean_text = re.sub(r"<(script|style|nav|footer)[^>]*>.*?</\1>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    clean_text = re.sub(r"<[^>]+>", " ", clean_text)
    clean_text = re.sub(r"\s+", " ", clean_text).strip()

    if not clean_text or len(clean_text) < 50:
        raise ValueError("Could not extract meaningful content from the provided URL.")

    # Create safe filename
    parsed = urlparse(url)
    slug = re.sub(r"[^a-zA-Z0-9_-]", "_", f"{parsed.netloc}{parsed.path}")[:60].strip("_")
    filename = f"web_{slug}.txt"

    raw_dir = config.raw_docs_path
    raw_dir.mkdir(parents=True, exist_ok=True)
    dest = raw_dir / filename
    dest.write_text(f"URL: {url}\n\n{clean_text}", encoding="utf-8")

    pipeline = IngestionPipeline(config)
    result = pipeline.run([dest])
    return filename, result.data

