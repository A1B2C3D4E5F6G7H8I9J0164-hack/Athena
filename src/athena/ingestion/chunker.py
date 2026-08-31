"""
Text chunking with overlap and metadata preservation.

Design decisions:
1. Character-based chunking (not token-based) for simplicity and zero extra deps.
   Trade-off: chunks may split mid-sentence. Overlap mitigates context loss.
2. Page/section metadata travels with each chunk — required for citation in Phase 2.
3. Section detection uses markdown-style headers (# ...) when present.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass

from athena.config.settings import ChunkConfig
from athena.models import Chunk, LoadedDocument

# Matches markdown headers (# Title) or ALL-CAPS section lines
_SECTION_PATTERN = re.compile(r"^(?:#{1,6}\s+(.+)|([A-Z][A-Z0-9\s\-]{4,}))$", re.MULTILINE)


@dataclass
class Chunker:
    config: ChunkConfig

    def chunk_document(self, doc: LoadedDocument) -> list[Chunk]:
        """Split a loaded document into overlapping chunks with metadata."""
        all_chunks: list[Chunk] = []
        global_index = 0

        for page in doc.pages:
            sections = self._detect_sections(page.text)
            for section_name, section_text in sections:
                page_chunks = self._split_with_overlap(section_text)
                for local_idx, chunk_text in enumerate(page_chunks):
                    if len(chunk_text) < self.config.min_size and local_idx > 0:
                        # Merge tiny tail into previous chunk if possible
                        if all_chunks and all_chunks[-1].page_number == page.page_number:
                            all_chunks[-1].text += " " + chunk_text
                            continue

                    all_chunks.append(
                        Chunk(
                            chunk_id=f"{doc.source_id}_{global_index}_{uuid.uuid4().hex[:8]}",
                            text=chunk_text,
                            source_id=doc.source_id,
                            source_path=doc.source_path,
                            page_number=page.page_number,
                            section=section_name,
                            chunk_index=global_index,
                        )
                    )
                    global_index += 1

        return all_chunks

    def _detect_sections(self, text: str) -> list[tuple[str, str]]:
        """
        Split page text into (section_name, section_body) pairs.

        If no headers found, the whole page is one section with empty name.
        """
        matches = list(_SECTION_PATTERN.finditer(text))
        if not matches:
            return [("", text)]

        sections: list[tuple[str, str]] = []
        for i, match in enumerate(matches):
            name = (match.group(1) or match.group(2) or "").strip()
            start = match.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            body = text[start:end].strip()
            if body:
                sections.append((name, body))

        # Content before first header
        preamble = text[: matches[0].start()].strip()
        if preamble:
            sections.insert(0, ("", preamble))

        return sections if sections else [("", text)]

    def _split_with_overlap(self, text: str) -> list[str]:
        """Sliding window split with overlap to preserve cross-boundary context."""
        size = self.config.size
        overlap = self.config.overlap
        if len(text) <= size:
            return [text]

        chunks: list[str] = []
        start = 0
        while start < len(text):
            end = start + size
            chunk = text[start:end]

            # Try to break at sentence boundary when not at end of text
            if end < len(text):
                chunk = self._break_at_sentence(chunk)

            chunks.append(chunk.strip())
            start += size - overlap

        return [c for c in chunks if c]

    @staticmethod
    def _break_at_sentence(text: str) -> str:
        """Prefer breaking at '. ' or '\\n' near the end of a chunk."""
        for sep in [". ", ".\n", "\n\n", "\n", " "]:
            idx = text.rfind(sep)
            if idx > len(text) * 0.5:  # Only break if we're past halfway
                return text[: idx + len(sep)]
        return text
