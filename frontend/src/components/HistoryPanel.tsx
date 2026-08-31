import { useState } from "react";
import { History, X, Search, Clock, Compass, Database, Globe } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { HistoryItem } from "../api";

interface Props {
  items: HistoryItem[];
  open: boolean;
  onClose: () => void;
  onSelect: (item: HistoryItem) => void;
}

export default function HistoryPanel({ items, open, onClose, onSelect }: Props) {
  const [search, setSearch] = useState("");

  if (!open) return null;

  const filtered = items.filter(
    (it) =>
      it.query.toLowerCase().includes(search.toLowerCase()) ||
      it.answer.toLowerCase().includes(search.toLowerCase()) ||
      it.route.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.aside
          initial={{ x: 420 }}
          animate={{ x: 0 }}
          exit={{ x: 420 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className="relative ml-auto w-full max-w-md h-full bg-[#080811] border-l border-white/10 flex flex-col shadow-2xl z-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-athena-accent/20 border border-athena-accent/30 flex items-center justify-center text-athena-glow">
                <History className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">Query History Audit</h2>
                <p className="text-[11px] text-zinc-500">{items.length} logged research runs</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search bar */}
          <div className="p-3 border-b border-white/5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search past research queries..."
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-athena-accent"
              />
            </div>
          </div>

          {/* History list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filtered.length === 0 && (
              <div className="text-center py-12 text-zinc-600 text-xs">
                {items.length === 0 ? "No queries logged yet." : "No queries match your search."}
              </div>
            )}
            {filtered.map((item) => (
              <motion.button
                key={item.id}
                type="button"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => onSelect(item)}
                className="w-full text-left p-3.5 rounded-xl border border-white/5 hover:border-athena-accent/30 hover:bg-white/[0.03] transition-all group space-y-2"
              >
                <p className="text-xs font-semibold text-zinc-200 line-clamp-2 group-hover:text-white transition-colors">
                  {item.query}
                </p>
                <div className="flex items-center justify-between text-[10px] text-zinc-500">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 uppercase font-mono px-1.5 py-0.5 rounded bg-white/5 text-zinc-400">
                      {item.route === "web" && <Globe className="w-2.5 h-2.5 text-athena-cyan" />}
                      {item.route === "rag" && <Database className="w-2.5 h-2.5 text-athena-accent" />}
                      {item.route === "both" && <Compass className="w-2.5 h-2.5 text-emerald-400" />}
                      {item.route}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {item.latency_ms.toFixed(0)}ms
                    </span>
                  </div>
                  <span>{new Date(item.created_at).toLocaleDateString()}</span>
                </div>
              </motion.button>
            ))}
          </div>
        </motion.aside>
      </div>
    </AnimatePresence>
  );
}
