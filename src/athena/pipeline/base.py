"""
Composable pipeline framework.

Design decision: explicit stage-based pipelines over a monolithic script.

Why this matters in interviews:
- Each stage has a single responsibility (load → chunk → embed → store).
- Stages are independently testable.
- The orchestrator can add checkpointing, retries, and metrics per stage later.
- Phase 2 agent tools can reuse the same retrieval pipeline without duplication.
"""

from __future__ import annotations

import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Generic, TypeVar

logger = logging.getLogger(__name__)

TIn = TypeVar("TIn")
TOut = TypeVar("TOut")


@dataclass
class StageResult(Generic[TOut]):
    """Wraps stage output with timing and optional metadata for observability."""

    data: TOut
    stage_name: str
    elapsed_ms: float
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class PipelineResult(Generic[TOut]):
    """Final output of a multi-stage pipeline run."""

    data: TOut
    stage_results: list[StageResult[Any]]
    total_elapsed_ms: float

    def summary(self) -> dict[str, Any]:
        return {
            "total_elapsed_ms": round(self.total_elapsed_ms, 2),
            "stages": [
                {
                    "name": sr.stage_name,
                    "elapsed_ms": round(sr.elapsed_ms, 2),
                    **sr.metadata,
                }
                for sr in self.stage_results
            ],
        }


class PipelineStage(ABC, Generic[TIn, TOut]):
    """
    Abstract base for one pipeline step.

    Subclasses implement `run()` — the orchestrator handles timing and logging.
    """

    name: str = "unnamed_stage"

    @abstractmethod
    def run(self, input_data: TIn, context: dict[str, Any]) -> TOut:
        """Transform input_data into output. Context carries shared config/state."""
        ...


class PipelineOrchestrator(Generic[TIn, TOut]):
    """
    Runs an ordered list of stages, passing output of stage N as input to stage N+1.

    The `context` dict is shared across all stages (config, stores, etc.).
    """

    def __init__(self, stages: list[PipelineStage[Any, Any]], name: str = "pipeline"):
        self.stages = stages
        self.name = name

    def run(self, input_data: TIn, context: dict[str, Any] | None = None) -> PipelineResult[TOut]:
        context = context or {}
        stage_results: list[StageResult[Any]] = []
        current: Any = input_data
        pipeline_start = time.perf_counter()

        logger.info("Starting pipeline '%s' with %d stages", self.name, len(self.stages))

        for stage in self.stages:
            stage_start = time.perf_counter()
            logger.info("  → Stage: %s", stage.name)

            current = stage.run(current, context)
            elapsed_ms = (time.perf_counter() - stage_start) * 1000

            metadata = context.get(f"{stage.name}_metadata", {})
            stage_results.append(
                StageResult(
                    data=current,
                    stage_name=stage.name,
                    elapsed_ms=elapsed_ms,
                    metadata=metadata,
                )
            )
            logger.info("  ✓ %s completed in %.1f ms", stage.name, elapsed_ms)

        total_ms = (time.perf_counter() - pipeline_start) * 1000
        logger.info("Pipeline '%s' finished in %.1f ms", self.name, total_ms)

        return PipelineResult(
            data=current,
            stage_results=stage_results,
            total_elapsed_ms=total_ms,
        )
