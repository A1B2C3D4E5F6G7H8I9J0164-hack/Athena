"""
Document registry for incremental ingestion.

Design decision: track file hashes in a JSON registry so re-running ingestion
skips unchanged documents. This is a lightweight alternative to a full metadata DB
and demonstrates awareness of production ingestion patterns (idempotency).
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class RegistryEntry:
    source_id: str
    source_path: str
    file_hash: str
    file_type: str
    chunk_count: int
    ingested_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class DocumentRegistry:
    """JSON-backed registry of ingested documents."""

    def __init__(self, registry_path: Path) -> None:
        self.registry_path = registry_path
        self._entries: dict[str, RegistryEntry] = {}
        self._load()

    def _load(self) -> None:
        if self.registry_path.exists():
            raw = json.loads(self.registry_path.read_text(encoding="utf-8"))
            self._entries = {k: RegistryEntry(**v) for k, v in raw.items()}

    def save(self) -> None:
        self.registry_path.parent.mkdir(parents=True, exist_ok=True)
        data = {k: asdict(v) for k, v in self._entries.items()}
        self.registry_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def is_unchanged(self, source_id: str, file_hash: str) -> bool:
        entry = self._entries.get(source_id)
        return entry is not None and entry.file_hash == file_hash

    def register(self, entry: RegistryEntry) -> None:
        self._entries[entry.source_id] = entry
        logger.info(
            "Registered '%s' (%d chunks, hash=%s…)",
            entry.source_id,
            entry.chunk_count,
            entry.file_hash[:12],
        )

    def list_entries(self) -> list[RegistryEntry]:
        return list(self._entries.values())

    def remove(self, source_id: str) -> None:
        self._entries.pop(source_id, None)
