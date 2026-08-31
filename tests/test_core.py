"""Basic unit tests for Phase 1 core logic."""

from athena.ingestion.chunker import Chunker
from athena.config.settings import ChunkConfig
from athena.models import DocumentPage, LoadedDocument
from athena.retrieval.fusion import reciprocal_rank_fusion
from athena.models import RetrievalResult
from athena.eval.metrics import precision_at_k, recall_at_k, QAPair


def test_chunker_splits_with_overlap():
    config = ChunkConfig(size=100, overlap=20, min_size=10)
    chunker = Chunker(config)
    doc = LoadedDocument(
        source_id="test",
        source_path="/tmp/test.txt",
        file_type="txt",
        pages=[DocumentPage(text="A" * 250, page_number=0)],
    )
    chunks = chunker.chunk_document(doc)
    assert len(chunks) >= 2
    assert all(c.page_number == 0 for c in chunks)
    assert all(c.source_id == "test" for c in chunks)


def test_rrf_merges_two_lists():
    dense = [
        RetrievalResult("a", "text a", {}, dense_score=0.9),
        RetrievalResult("b", "text b", {}, dense_score=0.8),
    ]
    sparse = [
        RetrievalResult("b", "text b", {}, sparse_score=5.0),
        RetrievalResult("c", "text c", {}, sparse_score=4.0),
    ]
    fused = reciprocal_rank_fusion([dense, sparse], top_k=3)
    ids = [r.chunk_id for r in fused]
    assert "b" in ids  # Appears in both lists → should rank high
    assert len(fused) == 3


def test_precision_recall_at_k():
    results = [
        RetrievalResult("a", "text", {}, rerank_score=0.9),
        RetrievalResult("b", "text", {}, rerank_score=0.8),
        RetrievalResult("c", "text", {}, rerank_score=0.7),
    ]
    qa = QAPair(question="q", relevant_chunk_ids=["a", "c"])
    assert precision_at_k(results, qa, 2) == 0.5  # 1 of 2 relevant
    assert recall_at_k(results, qa, 2) == 0.5  # found 1 of 2 relevant
