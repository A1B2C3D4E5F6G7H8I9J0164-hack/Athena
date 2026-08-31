"""CLI entry point for Athena Phase 1 commands."""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

import click
from rich.console import Console
from rich.logging import RichHandler
from rich.table import Table

from athena.config.settings import load_config
from athena.eval.metrics import load_qa_pairs, run_evaluation
from athena.ingestion.pipeline import IngestionPipeline
from athena.retrieval.hybrid_pipeline import HybridRetrievalPipeline

console = Console()


def _setup_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(message)s",
        handlers=[RichHandler(rich_tracebacks=True, show_path=False)],
    )


@click.group()
@click.option("--config", "config_path", default=None, help="Path to YAML config file")
@click.option("-v", "--verbose", is_flag=True, help="Enable debug logging")
@click.pass_context
def main(ctx: click.Context, config_path: str | None, verbose: bool) -> None:
    """Athena — autonomous research agent (Phase 1: RAG Core)."""
    _setup_logging(verbose)
    ctx.ensure_object(dict)
    ctx.obj["config"] = load_config(config_path)


@main.command()
@click.argument("files", nargs=-1, type=click.Path(exists=True, path_type=Path))
@click.pass_context
def ingest(ctx: click.Context, files: tuple[Path, ...]) -> None:
    """
    Run the ingestion pipeline on documents.

    Files are loaded from arguments, or from data/raw/ if none provided.
    """
    config = ctx.obj["config"]
    pipeline = IngestionPipeline(config)

    console.print("[bold blue]Starting ingestion pipeline…[/bold blue]")
    result = pipeline.run(list(files) if files else None)

    summary = result.summary()
    table = Table(title="Ingestion Pipeline Summary")
    table.add_column("Stage", style="cyan")
    table.add_column("Time (ms)", justify="right")
    table.add_column("Details")

    for stage in summary["stages"]:
        details = ", ".join(f"{k}={v}" for k, v in stage.items() if k not in ("name", "elapsed_ms"))
        table.add_row(stage["name"], str(stage["elapsed_ms"]), details)

    table.add_row("[bold]TOTAL[/bold]", f"[bold]{summary['total_elapsed_ms']}[/bold]", "")
    console.print(table)
    console.print(f"\n[green]✓ Stored {result.data} chunks in vector DB[/green]")


@main.command()
@click.argument("query")
@click.option("--top-k", default=None, type=int, help="Override rerank top-k")
@click.pass_context
def search(ctx: click.Context, query: str, top_k: int | None) -> None:
    """Run hybrid retrieval + reranking on a query."""
    config = ctx.obj["config"]
    if top_k:
        config.retrieval.rerank_top_k = top_k

    pipeline = HybridRetrievalPipeline(config)
    result = pipeline.retrieve(query)

    console.print(f"\n[bold]Query:[/bold] {query}")
    console.print(f"[dim]Retrieval time: {result.elapsed_ms:.1f} ms[/dim]\n")

    for i, r in enumerate(result.results, 1):
        console.print(f"[bold cyan][{i}][/bold cyan] [yellow]{r.citation_label()}[/yellow]")
        console.print(f"  rerank={r.rerank_score:.4f}  rrf={r.rrf_score:.4f}")
        preview = r.text[:300].replace("\n", " ")
        console.print(f"  {preview}{'…' if len(r.text) > 300 else ''}\n")


@main.command(name="eval")
@click.option("--qa-file", default=None, help="Path to labeled Q&A JSON")
@click.option("--output", "-o", default=None, help="Save results JSON to file")
@click.pass_context
def eval_cmd(ctx: click.Context, qa_file: str | None, output: str | None) -> None:
    """
    Evaluate retrieval quality on a labeled Q&A set.

    Computes precision@k, recall@k, and MRR. Results are computed, not fabricated.
    """
    config = ctx.obj["config"]
    qa_path = Path(qa_file or config.eval.qa_file)

    if not qa_path.exists():
        console.print(f"[red]Q&A file not found: {qa_path}[/red]")
        console.print("Create data/eval/qa_pairs.json with labeled questions first.")
        sys.exit(1)

    qa_pairs = load_qa_pairs(qa_path)
    console.print(f"[bold blue]Evaluating {len(qa_pairs)} questions…[/bold blue]")

    pipeline = HybridRetrievalPipeline(config)
    metrics = run_evaluation(pipeline, qa_pairs, config.eval.k_values)

    table = Table(title="Retrieval Evaluation Metrics")
    table.add_column("Metric", style="cyan")
    table.add_column("Value", justify="right")

    for k in sorted(metrics.precision_at_k.keys()):
        table.add_row(f"Precision@{k}", f"{metrics.precision_at_k[k]:.4f}")
        table.add_row(f"Recall@{k}", f"{metrics.recall_at_k[k]:.4f}")
    table.add_row("MRR", f"{metrics.mrr:.4f}")

    console.print(table)
    console.print(
        "\n[dim]Note: metrics reflect your labeled eval set only. "
        "Expand qa_pairs.json for more reliable estimates.[/dim]"
    )

    if output:
        out_path = Path(output)
        out_path.write_text(
            json.dumps(
                {
                    "precision_at_k": metrics.precision_at_k,
                    "recall_at_k": metrics.recall_at_k,
                    "mrr": metrics.mrr,
                    "per_question": metrics.per_question,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        console.print(f"[green]Results saved to {out_path}[/green]")


@main.command()
@click.pass_context
def status(ctx: click.Context) -> None:
    """Show ingestion registry and vector store stats."""
    config = ctx.obj["config"]
    from athena.ingestion.registry import DocumentRegistry
    from athena.storage.chroma_store import ChromaVectorStore

    registry = DocumentRegistry(config.registry_path)
    store = ChromaVectorStore(config)

    console.print("[bold]Document Registry[/bold]")
    entries = registry.list_entries()
    if not entries:
        console.print("  [dim]No documents ingested yet.[/dim]")
    for entry in entries:
        console.print(f"  • {entry.source_id} ({entry.chunk_count} chunks, {entry.file_type})")

    console.print(f"\n[bold]Vector Store[/bold]: {store.count} total chunks")


if __name__ == "__main__":
    main()
