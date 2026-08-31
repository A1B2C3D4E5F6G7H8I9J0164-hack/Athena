import { useState } from "react";
import { motion } from "framer-motion";
import { FileText, ExternalLink, ShieldCheck, Eye } from "lucide-react";
import type { Citation } from "../api";
import CitationModal from "./CitationModal";

interface Props {
  citations: Citation[];
}

export default function CitationCards({ citations }: Props) {
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);

  if (citations.length === 0) return null;

  return (
    <>
      <div className="mt-4">
        <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-semibold uppercase tracking-wider mb-2.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Cited Knowledge Sources ({citations.length})</span>
        </div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.05 } },
          }}
          className="grid gap-2.5 sm:grid-cols-2"
        >
          {citations.map((c) => (
            <motion.div
              key={c.id}
              onClick={() => setActiveCitation(c)}
              variants={{
                hidden: { opacity: 0, y: 10, scale: 0.96 },
                visible: {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: { type: "spring", stiffness: 320, damping: 25 },
                },
              }}
              whileHover={{ scale: 1.02, y: -2 }}
              className="glass rounded-xl p-3 border border-white/5 hover:border-athena-accent/40 cursor-pointer group transition-all relative overflow-hidden"
            >
              <div className="flex items-start gap-2.5">
                <span className="flex-shrink-0 w-6 h-6 rounded-lg bg-athena-accent/20 border border-athena-accent/30 text-athena-glow text-xs font-bold flex items-center justify-center group-hover:bg-athena-accent group-hover:text-white transition-colors">
                  {c.id}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {c.source_type === "web" ? (
                        <ExternalLink className="w-3 h-3 text-athena-cyan shrink-0" />
                      ) : (
                        <FileText className="w-3 h-3 text-athena-accent shrink-0" />
                      )}
                      <p className="text-xs font-semibold text-zinc-200 truncate group-hover:text-white transition-colors">
                        {c.label}
                      </p>
                    </div>

                    <Eye className="w-3 h-3 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>

                  <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2 leading-relaxed italic">
                    "{c.excerpt}"
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <CitationModal citation={activeCitation} onClose={() => setActiveCitation(null)} />
    </>
  );
}
