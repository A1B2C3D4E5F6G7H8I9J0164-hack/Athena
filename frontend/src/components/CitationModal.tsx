import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, FileText, Globe, Copy, Check, Search, ShieldCheck } from "lucide-react";
import type { Citation } from "../api";

interface Props {
  citation: Citation | null;
  onClose: () => void;
}

export default function CitationModal({ citation, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  if (!citation) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(`[${citation.id}] ${citation.label}\n${citation.excerpt}\n${citation.url || ""}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isWeb = citation.source_type === "web";

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/75 backdrop-blur-md"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="relative w-full max-w-lg glass rounded-2xl glow-border p-6 shadow-2xl z-10 overflow-hidden"
        >
          {/* Top header */}
          <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-athena-accent/20 border border-athena-accent/30 text-athena-glow flex items-center justify-center font-bold text-sm">
                [{citation.id}]
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    isWeb
                      ? "bg-athena-cyan/10 border-athena-cyan/30 text-athena-cyan"
                      : "bg-athena-accent/10 border-athena-accent/30 text-athena-glow"
                  }`}>
                    {isWeb ? "Web Source" : "Local Knowledge Base"}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                    <ShieldCheck className="w-3 h-3" /> Verified Claim
                  </span>
                </div>
                <h3 className="text-sm font-medium text-zinc-100 mt-1 truncate max-w-xs sm:max-w-sm">
                  {citation.label}
                </h3>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="text-zinc-500 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Excerpt Body */}
          <div className="my-5 space-y-3">
            <div className="text-xs text-zinc-400 font-medium flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-zinc-500" /> Extracted Document Context:
            </div>
            <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-xs sm:text-sm text-zinc-300 leading-relaxed max-h-56 overflow-y-auto italic">
              "{citation.excerpt}"
            </div>
          </div>

          {/* Source Link / URI */}
          {citation.url && (
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between gap-3 text-xs mb-5">
              <div className="flex items-center gap-2 text-zinc-400 truncate">
                {isWeb ? <Globe className="w-3.5 h-3.5 text-athena-cyan shrink-0" /> : <FileText className="w-3.5 h-3.5 text-athena-accent shrink-0" />}
                <span className="truncate text-zinc-300">{citation.url}</span>
              </div>
              {citation.url.startsWith("http") && (
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-athena-cyan hover:underline shrink-0"
                >
                  Visit <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 text-xs text-zinc-300 hover:text-white hover:bg-white/5 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy Citation"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-athena-accent to-athena-cyan text-white text-xs font-medium hover:opacity-95 transition-opacity"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
