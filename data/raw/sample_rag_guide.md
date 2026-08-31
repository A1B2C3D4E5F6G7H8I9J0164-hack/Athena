# Transformers and Retrieval-Augmented Generation

## Overview

Retrieval-Augmented Generation (RAG) combines information retrieval with large language models. Instead of relying solely on the model's parametric memory, RAG retrieves relevant documents at query time and conditions the generation on them.

## Why RAG?

Pure LLM approaches suffer from:
- **Knowledge cutoff**: Models don't know events after training.
- **Hallucination**: Models confidently generate false facts.
- **No citations**: Answers can't be traced to source documents.

RAG addresses these by retrieving grounded context before generation.

## Hybrid Retrieval

Modern RAG systems use hybrid retrieval combining:

1. **Dense retrieval**: Semantic similarity via embedding models (e.g., MiniLM, BGE).
2. **Sparse retrieval**: Lexical matching via BM25 (keyword overlap).
3. **Fusion**: Reciprocal Rank Fusion (RRF) merges ranked lists without score normalization.
4. **Reranking**: Cross-encoders rescore top candidates for precision.

### Why Not Pure Vector Search?

Vector search misses exact keyword matches — product codes, names, acronyms. BM25 complements embeddings by excelling at term-frequency signals. Hybrid retrieval with RRF gives robust recall without hand-tuning score weights.

## Chunking Strategy

Documents are split into overlapping chunks (default: 512 chars, 64 overlap). Overlap preserves context that would otherwise be lost at chunk boundaries. Each chunk carries metadata: source file, page number, and detected section header — critical for citation in downstream answer generation.

## Evaluation

Retrieval quality is measured with:
- **Precision@k**: Fraction of top-k results that are relevant.
- **Recall@k**: Fraction of all relevant documents found in top-k.
- **MRR**: Mean Reciprocal Rank of the first relevant result.

Metrics require a labeled evaluation set — they are computed, not estimated.
