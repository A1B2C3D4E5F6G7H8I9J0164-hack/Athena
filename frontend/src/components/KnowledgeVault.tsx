import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Globe,
  FileText,
  Trash2,
  Eye,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Database,
  Search,
  X,
  FileCode,
  Sparkles,
} from "lucide-react";
import {
  uploadDocument,
  ingestUrl,
  deleteDocument,
  fetchDocumentChunks,
} from "../api";
import type { DocumentInfo, ChunkDetail } from "../api";

interface Props {
  documents: DocumentInfo[];
  onRefresh: () => void;
}

export default function KnowledgeVault({ documents, onRefresh }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<"upload" | "url">("upload");
  const [urlInput, setUrlInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [urlLoading, setUrlLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Chunks inspector modal
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<ChunkDetail[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [chunkSearch, setChunkSearch] = useState("");

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setFeedback(null);

    let successCount = 0;
    let totalChunks = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const res = await uploadDocument(file);
        successCount++;
        totalChunks += res.chunks_stored;
      }
      setFeedback({
        type: "success",
        msg: `Successfully ingested ${successCount} file(s) (${totalChunks} chunks stored in ChromaDB).`,
      });
      onRefresh();
    } catch (err: any) {
      setFeedback({ type: "error", msg: err.message || "Upload failed." });
    } finally {
      setUploading(false);
    }
  };

  const handleUrlIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || urlLoading) return;
    setUrlLoading(true);
    setFeedback(null);

    try {
      const res = await ingestUrl(urlInput.trim());
      setFeedback({
        type: "success",
        msg: `Successfully indexed web page: ${res.filename} (${res.chunks_stored} chunks)`,
      });
      setUrlInput("");
      onRefresh();
    } catch (err: any) {
      setFeedback({ type: "error", msg: err.message || "URL scraping failed." });
    } finally {
      setUrlLoading(false);
    }
  };

  const handleDelete = async (sourceId: string) => {
    if (!confirm(`Are you sure you want to delete "${sourceId}" from ChromaDB and the registry?`)) return;
    try {
      await deleteDocument(sourceId);
      setFeedback({ type: "success", msg: `Deleted "${sourceId}" from knowledge base.` });
      onRefresh();
    } catch (err: any) {
      setFeedback({ type: "error", msg: err.message || "Delete failed." });
    }
  };

  const openChunkInspector = async (sourceId: string) => {
    setSelectedDocId(sourceId);
    setChunksLoading(true);
    setChunkSearch("");
    try {
      const res = await fetchDocumentChunks(sourceId);
      setChunks(res.chunks);
    } catch {
      setChunks([]);
    } finally {
      setChunksLoading(false);
    }
  };

  const filteredChunks = chunks.filter((c) =>
    c.text.toLowerCase().includes(chunkSearch.toLowerCase()) ||
    c.chunk_id.toLowerCase().includes(chunkSearch.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 max-w-6xl mx-auto w-full">
      {/* Header Banner */}
      <div className="glass rounded-2xl glow-border p-6 relative overflow-hidden">
        <div className="glow-ambient -bottom-24 -left-24 bg-athena-cyan/30" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-athena-accent mb-2">
              <Database className="w-4 h-4" /> Knowledge Base Management
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold gradient-text mb-2">
              Knowledge Vault
            </h2>
            <p className="text-zinc-400 text-sm max-w-xl leading-relaxed">
              Upload local documents (PDF, TXT, MD) or scrape web articles. All content is automatically chunked, embedded with MiniLM, and indexed in ChromaDB for hybrid RAG.
            </p>
          </div>

          <div className="px-4 py-2 rounded-xl glass border border-white/10 flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-zinc-500">Total Ingested</p>
              <p className="text-xl font-bold text-white">{documents.length} Docs</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-athena-cyan/10 border border-athena-cyan/20 flex items-center justify-center text-athena-cyan">
              <FileCode className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Upload / Ingestion Box */}
      <div className="glass rounded-2xl p-6 glow-border space-y-4">
        <div className="flex items-center gap-3 border-b border-white/10 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab("upload")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "upload"
                ? "bg-athena-accent/20 border border-athena-accent/40 text-athena-glow shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
            }`}
          >
            <Upload className="w-3.5 h-3.5" /> File Ingestion (PDF / TXT / MD)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("url")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "url"
                ? "bg-athena-cyan/20 border border-athena-cyan/40 text-athena-cyan shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
            }`}
          >
            <Globe className="w-3.5 h-3.5" /> Live Web URL Ingestor
          </button>
        </div>

        {activeTab === "upload" ? (
          <div>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFileUpload(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                dragOver
                  ? "border-athena-accent bg-athena-accent/10 scale-[1.01]"
                  : "border-white/10 hover:border-white/30 bg-black/20"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.txt,.md"
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files)}
              />
              {uploading ? (
                <div className="space-y-2">
                  <Loader2 className="w-8 h-8 mx-auto animate-spin text-athena-accent" />
                  <p className="text-sm font-medium text-zinc-200">Chunking & Embedding Documents...</p>
                  <p className="text-xs text-zinc-500">Writing dense vectors to ChromaDB collection</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-athena-accent/15 border border-athena-accent/25 flex items-center justify-center mx-auto text-athena-glow mb-3">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-medium text-zinc-200">
                    Click to browse or drop PDF, TXT, or Markdown files
                  </p>
                  <p className="text-xs text-zinc-500">
                    Automatic recursive character chunking with 20% overlap + BM25 sparse index sync
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleUrlIngest} className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Globe className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3.5" />
                <input
                  type="url"
                  required
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://en.wikipedia.org/wiki/LangChain or any public article/doc URL..."
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-athena-cyan transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={urlLoading || !urlInput.trim()}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-athena-cyan to-athena-accent text-white text-xs font-semibold flex items-center gap-2 hover:opacity-90 disabled:opacity-40 transition-all shrink-0"
              >
                {urlLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>Fetch & Ingest</span>
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              Scrapes main text content, strips extraneous HTML markup, and ingests into your hybrid vector index.
            </p>
          </form>
        )}

        {/* Feedback Alert */}
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
              feedback.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/30 text-rose-300"
            }`}
          >
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.msg}</span>
          </motion.div>
        )}
      </div>

      {/* Documents List */}
      <div className="glass rounded-2xl glow-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
            Indexed Knowledge Sources ({documents.length})
          </h3>
          <button
            type="button"
            onClick={onRefresh}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Refresh List
          </button>
        </div>

        {documents.length === 0 ? (
          <div className="text-center py-12 text-zinc-600 text-sm">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No documents ingested yet. Upload PDFs or scrape URLs above to populate your knowledge base.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {documents.map((doc) => (
              <div
                key={doc.source_id}
                className="py-3.5 flex items-center justify-between gap-4 group hover:bg-white/[0.02] px-2 rounded-xl transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 group-hover:text-athena-glow group-hover:border-athena-accent/30 transition-colors shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate group-hover:text-white transition-colors">
                      {doc.source_id}
                    </p>
                    <p className="text-xs text-zinc-500 flex items-center gap-2">
                      <span className="uppercase font-mono text-[10px] text-athena-cyan">{doc.file_type}</span>
                      <span>•</span>
                      <span>{doc.chunk_count} Chunks</span>
                      <span>•</span>
                      <span>{new Date(doc.ingested_at).toLocaleDateString()}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openChunkInspector(doc.source_id)}
                    className="p-2 rounded-lg border border-white/5 text-zinc-400 hover:text-white hover:bg-white/5 hover:border-white/20 transition-all flex items-center gap-1.5 text-xs"
                    title="View Document Chunks"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Inspect</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(doc.source_id)}
                    className="p-2 rounded-lg border border-white/5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 transition-all"
                    title="Delete Document"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chunk Inspector Modal */}
      <AnimatePresence>
        {selectedDocId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDocId(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-3xl glass rounded-2xl glow-border p-6 shadow-2xl z-10 max-h-[85vh] flex flex-col"
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div>
                  <h3 className="text-base font-semibold text-zinc-100 truncate">
                    Document Chunks: {selectedDocId}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    {chunks.length} chunks indexed in ChromaDB vector store
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDocId(null)}
                  className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Chunk search */}
              <div className="my-4 relative">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                <input
                  type="text"
                  value={chunkSearch}
                  onChange={(e) => setChunkSearch(e.target.value)}
                  placeholder="Filter chunks by keyword..."
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-athena-accent"
                />
              </div>

              {/* Chunks scroll list */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {chunksLoading ? (
                  <div className="py-12 text-center text-zinc-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-athena-accent" />
                    Loading chunks from ChromaDB...
                  </div>
                ) : filteredChunks.length === 0 ? (
                  <div className="py-8 text-center text-zinc-600 text-xs">
                    No matching chunks found.
                  </div>
                ) : (
                  filteredChunks.map((chunk, i) => (
                    <div
                      key={chunk.chunk_id}
                      className="p-3.5 rounded-xl bg-black/30 border border-white/5 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between text-[11px] text-zinc-400">
                        <span className="font-mono text-athena-glow">
                          Chunk #{i + 1} ({chunk.chunk_id})
                        </span>
                        <span>Page {chunk.page_number}</span>
                      </div>
                      <p className="text-zinc-300 leading-relaxed font-sans">
                        {chunk.text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
