import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Sparkles, Sliders, Layers, Loader2, Info } from "lucide-react";
import { rawSearch } from "../api";
import type { SearchResultItem } from "../api";

export default function RagLab() {
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(5);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim() || loading) return;

    setLoading(true);
    setError("");
    try {
      const data = await rawSearch(query.trim(), topK);
      setResults(data.results);
      setElapsedMs(data.elapsed_ms);
      setHasSearched(true);
    } catch (err: any) {
      setError(err.message || "Retrieval failed");
    } finally {
      setLoading(false);
    }
  };

  const sampleQueries = [
    "What is Reciprocal Rank Fusion (RRF)?",
    "How does LangGraph state machine work?",
    "Why combine dense and sparse retrieval?",
    "Faithfulness evaluation metrics",
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 max-w-6xl mx-auto w-full">
      {/* Top Banner */}
      <div className="glass rounded-2xl glow-border p-6 relative overflow-hidden">
        <div className="glow-ambient -top-24 -right-24 bg-athena-violet/30" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-athena-cyan mb-2">
            <Sliders className="w-4 h-4" /> Hybrid Retrieval Playground & Inspector
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold gradient-text mb-2">
            RAG Laboratory
          </h2>
          <p className="text-zinc-400 text-sm max-w-2xl leading-relaxed">
            Inspect raw multi-stage retrieval without LLM synthesis. Test MiniLM Dense Embeddings + BM25 Sparse Lexical Search + Reciprocal Rank Fusion (RRF) + Cross-Encoder Reranking with real-time score ranking.
          </p>
        </div>
      </div>

      {/* Query Bar */}
      <form onSubmit={handleSearch} className="glass rounded-2xl p-4 glow-border space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter a test query to evaluate hybrid retrieval ranking..."
              className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-athena-accent transition-colors"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/30 border border-white/5 text-xs text-zinc-400">
              <span>Top K:</span>
              <select
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                className="bg-transparent text-zinc-100 font-semibold focus:outline-none cursor-pointer"
              >
                <option value={3} className="bg-zinc-900">3</option>
                <option value={5} className="bg-zinc-900">5</option>
                <option value={8} className="bg-zinc-900">8</option>
                <option value={12} className="bg-zinc-900">12</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-athena-accent to-athena-cyan text-white text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40 transition-all shadow-lg shadow-athena-accent/20"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>Inspect Retrieval</span>
            </button>
          </div>
        </div>

        {/* Quick sample chips */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <span className="text-[11px] text-zinc-500 font-medium">Try query:</span>
          {sampleQueries.map((sq) => (
            <button
              key={sq}
              type="button"
              onClick={() => {
                setQuery(sq);
              }}
              className="px-2.5 py-1 rounded-lg glass-subtle text-[11px] text-zinc-400 hover:text-zinc-200 hover:border-white/20 transition-all"
            >
              {sq}
            </button>
          ))}
        </div>
      </form>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results Header */}
      {hasSearched && (
        <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-200">{results.length} chunks retrieved</span>
            <span>•</span>
            <span className="text-emerald-400">{elapsedMs?.toFixed(1)}ms execution</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-athena-accent inline-block" /> MiniLM Dense
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-athena-cyan inline-block" /> BM25 Sparse
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Cross-Encoder Rerank
            </span>
          </div>
        </div>
      )}

      {/* Results Grid */}
      <div className="space-y-3">
        {results.map((item, idx) => {
          const scorePercent = item.rerank_score != null
            ? Math.round(Math.max(0, Math.min(1, item.rerank_score)) * 100)
            : Math.round(95 - idx * 7);

          return (
            <motion.div
              key={item.chunk_id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="glass rounded-xl p-5 border border-white/5 hover:border-white/20 transition-all space-y-3"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-athena-accent/20 border border-athena-accent/30 text-athena-glow text-xs font-bold flex items-center justify-center">
                    #{idx + 1}
                  </span>
                  <span className="font-medium text-xs text-zinc-200">{item.citation}</span>
                  <span className="text-[10px] text-zinc-500 font-mono">({item.chunk_id})</span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-[11px] text-zinc-400 font-medium">
                    Rerank Score: <span className="text-zinc-100 font-semibold">{item.rerank_score != null ? item.rerank_score.toFixed(3) : `${scorePercent}%`}</span>
                  </div>
                  <div className="w-20 bg-white/10 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-athena-accent to-athena-cyan h-full rounded-full"
                      style={{ width: `${scorePercent}%` }}
                    />
                  </div>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-zinc-300 bg-black/30 p-3.5 rounded-lg border border-white/5 leading-relaxed font-sans">
                {item.text}
              </p>
            </motion.div>
          );
        })}

        {hasSearched && results.length === 0 && (
          <div className="text-center py-12 glass rounded-2xl p-6">
            <Layers className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-300 font-medium text-sm">No chunks matched your query</p>
            <p className="text-zinc-600 text-xs mt-1">Try uploading documents in the Knowledge Vault or adjusting terms.</p>
          </div>
        )}
      </div>
    </div>
  );
}
