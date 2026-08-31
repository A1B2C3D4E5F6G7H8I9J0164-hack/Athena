import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp, Cpu, BookOpen, Globe, Database, Layers, Compass } from "lucide-react";
import { VoiceInputButton } from "./AudioControls";
import type { RouteMode } from "../api";

interface Props {
  onSend: (query: string) => void;
  disabled: boolean;
  routeMode?: RouteMode;
  onRouteChange?: (mode: RouteMode) => void;
}

const PROMPT_CATEGORIES = [
  {
    category: "Architecture",
    icon: Cpu,
    prompts: [
      "Compare Dense vs BM25 sparse retrieval with RRF fusion",
      "Explain the LangGraph state machine flow in Vesper",
    ],
  },
  {
    category: "Deep RAG",
    icon: BookOpen,
    prompts: [
      "What are the benefits of cross-encoder reranking over vector similarity?",
      "How to prevent LLM hallucinations using inline citations?",
    ],
  },
  {
    category: "Live Web",
    icon: Globe,
    prompts: [
      "Latest breakthroughs in autonomous AI research agents 2026",
      "Current state of open source LLM benchmark leaderboards",
    ],
  },
];

export default function InputBar({ onSend, disabled, routeMode = "auto", onRouteChange }: Props) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("Architecture");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [input]);

  const submit = () => {
    const q = input.trim();
    if (!q || disabled) return;
    onSend(q);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const activePrompts = PROMPT_CATEGORIES.find((c) => c.category === selectedCategory)?.prompts || [];

  return (
    <div className="px-4 pb-6 pt-2 max-w-4xl mx-auto w-full">
      {/* Suggestion Prompts */}
      <AnimatePresence>
        {!input && !disabled && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mb-3.5 space-y-2"
          >
            {/* Category tabs */}
            <div className="flex items-center justify-center gap-1.5">
              {PROMPT_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const active = selectedCategory === cat.category;
                return (
                  <button
                    key={cat.category}
                    type="button"
                    onClick={() => setSelectedCategory(cat.category)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-all ${
                      active
                        ? "bg-white/10 text-white border border-white/20 shadow-sm"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{cat.category}</span>
                  </button>
                );
              })}
            </div>

            {/* Prompt Chips */}
            <div className="flex flex-wrap gap-2 justify-center">
              {activePrompts.map((p, i) => (
                <motion.button
                  key={p}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.04 }}
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onSend(p)}
                  className="px-3.5 py-1.5 rounded-md glass text-xs text-zinc-300 hover:text-white hover:border-white/30 transition-all text-left flex items-center gap-2 group"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white/60 group-hover:bg-white" />
                  <span>{p}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input container */}
      <motion.div
        animate={{
          boxShadow: focused
            ? "0 0 25px rgba(255, 255, 255, 0.08)"
            : "0 0 0px rgba(0, 0, 0, 0)",
        }}
        className="glass rounded-xl overflow-hidden bg-[#07070a]/90 backdrop-blur-xl border border-white/15"
      >
        <div className="p-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Ask Vesper to synthesize operational research across documents & web..."
            disabled={disabled}
            rows={1}
            className="w-full bg-transparent resize-none outline-none text-sm text-zinc-100 placeholder:text-zinc-500 max-h-[140px] py-1.5 px-1 font-sans"
          />

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10 mt-1">
            {/* Route Selector Pill */}
            {onRouteChange && (
              <div className="flex items-center gap-1 bg-black/50 p-1 rounded-md border border-white/10">
                {(
                  [
                    { id: "auto", label: "Auto", icon: Layers },
                    { id: "rag", label: "Local KB", icon: Database },
                    { id: "web", label: "Web", icon: Globe },
                    { id: "both", label: "Both", icon: Compass },
                  ] as const
                ).map((m) => {
                  const Icon = m.icon;
                  const active = routeMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onRouteChange(m.id)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                        active
                          ? "bg-white/15 text-white border border-white/20 shadow-sm"
                          : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 ml-auto">
              <VoiceInputButton
                onTranscript={(txt) => setInput((prev) => (prev ? `${prev} ${txt}` : txt))}
                disabled={disabled}
              />

              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={submit}
                disabled={disabled || !input.trim()}
                className={`flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center transition-all ${
                  input.trim() && !disabled
                    ? "btn-solid text-zinc-900 shadow-md"
                    : "bg-white/5 text-zinc-600 cursor-not-allowed border border-white/10"
                }`}
              >
                <ArrowUp className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="flex items-center justify-between text-[11px] text-zinc-500 mt-2 px-1">
        <span>Vesper Research Engine • Hybrid ChromaDB RAG + DuckDuckGo Web</span>
        <span className="hidden sm:inline font-mono">Press Enter ↵ to submit</span>
      </div>
    </div>
  );
}
