"""
Configuration loader for Athena.

Design decision: YAML + dataclasses instead of raw dicts everywhere.
- Interview-ready: you can point to typed config objects and explain each field.
- Safe defaults: missing keys fall back to sensible values rather than KeyError.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


@dataclass
class ChunkConfig:
    size: int = 512
    overlap: int = 64
    min_size: int = 100


@dataclass
class IngestionConfig:
    supported_extensions: list[str] = field(default_factory=lambda: [".pdf", ".txt", ".md"])
    incremental: bool = True
    chunk: ChunkConfig = field(default_factory=ChunkConfig)


@dataclass
class EmbeddingsConfig:
    model: str = "sentence-transformers/all-MiniLM-L6-v2"
    batch_size: int = 32
    device: str = "cpu"


@dataclass
class VectorStoreConfig:
    collection_name: str = "athena_documents"


@dataclass
class RetrievalConfig:
    dense_top_k: int = 20
    sparse_top_k: int = 20
    fusion_top_k: int = 10
    rerank_top_k: int = 5
    rrf_k: int = 60


@dataclass
class RerankerConfig:
    model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    batch_size: int = 16


@dataclass
class EvalConfig:
    k_values: list[int] = field(default_factory=lambda: [1, 3, 5, 10])
    qa_file: str = "data/eval/qa_pairs.json"


@dataclass
class LLMConfig:
    provider: str = "grok"
    model: str = "deepseek/deepseek-chat"
    openai_model: str = "gpt-4o-mini"
    openrouter_model: str = "x-ai/grok-2-1212"
    grok_model: str = "grok-beta"
    base_url: str = ""
    temperature: float = 0.2
    max_tokens: int = 1024




@dataclass
class AgentConfig:
    web_keywords: list[str] = field(
        default_factory=lambda: ["latest", "current", "today", "news", "recent"]
    )
    rag_confidence_threshold: float = 0.3
    max_web_results: int = 5


@dataclass
class APIConfig:
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: list[str] = field(
        default_factory=lambda: ["http://localhost:5173", "http://localhost:3000"]
    )
    db_path: str = "data/athena.db"


@dataclass
class LoggingConfig:
    enabled: bool = True
    db_path: str = "data/athena.db"


@dataclass
class ProjectConfig:
    name: str = "athena"
    data_dir: str = "data"
    persist_dir: str = "data/chroma"


@dataclass
class AthenaConfig:
    """Root configuration object passed through all pipelines."""

    project: ProjectConfig = field(default_factory=ProjectConfig)
    ingestion: IngestionConfig = field(default_factory=IngestionConfig)
    embeddings: EmbeddingsConfig = field(default_factory=EmbeddingsConfig)
    vector_store: VectorStoreConfig = field(default_factory=VectorStoreConfig)
    retrieval: RetrievalConfig = field(default_factory=RetrievalConfig)
    reranker: RerankerConfig = field(default_factory=RerankerConfig)
    eval: EvalConfig = field(default_factory=EvalConfig)
    llm: LLMConfig = field(default_factory=LLMConfig)
    agent: AgentConfig = field(default_factory=AgentConfig)
    api: APIConfig = field(default_factory=APIConfig)
    logging: LoggingConfig = field(default_factory=LoggingConfig)

    @property
    def db_path(self) -> Path:
        return Path(self.api.db_path)
    @property
    def data_path(self) -> Path:
        return Path(self.project.data_dir)


    @property
    def persist_path(self) -> Path:
        return Path(self.project.persist_dir)

    @property
    def raw_docs_path(self) -> Path:
        return self.data_path / "raw"

    @property
    def registry_path(self) -> Path:
        return self.data_path / "registry.json"


def _merge_dataclass(instance: Any, data: dict[str, Any]) -> None:
    """Recursively merge a dict into a dataclass instance (in-place)."""
    for key, value in data.items():
        if not hasattr(instance, key):
            continue
        current = getattr(instance, key)
        if hasattr(current, "__dataclass_fields__") and isinstance(value, dict):
            _merge_dataclass(current, value)
        else:
            setattr(instance, key, value)


def load_config(config_path: str | Path | None = None) -> AthenaConfig:
    """
    Load configuration from YAML file and .env environment file.

    Resolution order:
    1. Explicit config_path argument
    2. ATHENA_CONFIG environment variable
    3. config/default.yaml relative to project root
    """
    env_file = Path(".env")
    if env_file.exists():
        try:
            for line in env_file.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())
        except Exception:
            pass

    if config_path is None:
        config_path = os.environ.get("ATHENA_CONFIG", "config/default.yaml")

    path = Path(config_path)
    config = AthenaConfig()

    if path.exists():
        with path.open("r", encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}
        for section, values in raw.items():
            if hasattr(config, section) and isinstance(values, dict):
                _merge_dataclass(getattr(config, section), values)

    return config

