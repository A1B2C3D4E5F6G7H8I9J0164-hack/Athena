import { useState, type ElementType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  GitBranch,
  Search,
  Globe,
  PenLine,
  Link2,
  Send,
  CheckCircle2,
  Loader2,
  ChevronRight,
  Info,
} from "lucide-react";
import type { AgentStep } from "../api";

const STEP_ICONS: Record<string, ElementType> = {
  Plan: Brain,
  Route: GitBranch,
  Retrieve: Search,
  Search: Globe,
  Synthesize: PenLine,
  Cite: Link2,
  Respond: Send,
};

interface Props {
  steps: AgentStep[];
  isActive: boolean;
}

export default function AgentPipeline({ steps, isActive }: Props) {
  const [selectedStep, setSelectedStep] = useState<AgentStep | null>(null);

  if (steps.length === 0 && !isActive) return null;

  const displaySteps = isActive && steps.length === 0
    ? [{ name: "Plan", detail: "Formulating execution plan and query intent...", status: "running" }]
    : steps;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="mb-4 overflow-hidden"
    >
      <div className="glass rounded-2xl p-4 glow-border bg-[#0a0a12]/80">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-athena-cyan animate-pulse" />
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              LangGraph Agent Pipeline
            </p>
          </div>
          <span className="text-[11px] text-zinc-500 font-mono">
            {displaySteps.length} State Transitions
          </span>
        </div>

        {/* Step Nodes Row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {displaySteps.map((step, i) => {
            const Icon = STEP_ICONS[step.name] || Brain;
            const isRunning = step.status === "running" || (isActive && i === displaySteps.length - 1 && !step.detail.includes("delivered"));

            return (
              <div key={`${step.name}-${i}`} className="flex items-center gap-1.5">
                <motion.button
                  type="button"
                  onClick={() => setSelectedStep(step)}
                  initial={{ opacity: 0, scale: 0.85, x: -8 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  transition={{ delay: i * 0.06, type: "spring", stiffness: 320, damping: 24 }}
                  whileHover={{ scale: 1.04 }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs border transition-all cursor-pointer ${
                    isRunning
                      ? "border-athena-cyan/60 bg-athena-cyan/10 text-athena-cyan shadow-lg shadow-cyan-500/20"
                      : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-athena-accent/40 hover:bg-white/[0.06]"
                  }`}
                >
                  {isRunning ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-athena-cyan shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  )}
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-semibold">{step.name}</span>
                </motion.button>

                {i < displaySteps.length - 1 && (
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                )}
              </div>
            );
          })}
        </div>

        {/* Active Node Detail status */}
        {displaySteps.length > 0 && (
          <motion.div
            key={displaySteps[displaySteps.length - 1].detail}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 text-xs text-zinc-400 flex items-center gap-2 bg-black/30 px-3 py-2 rounded-xl border border-white/5"
          >
            <Info className="w-3.5 h-3.5 text-athena-accent shrink-0" />
            <span className="truncate">{displaySteps[displaySteps.length - 1].detail}</span>
          </motion.div>
        )}
      </div>

      {/* Detail Popover */}
      <AnimatePresence>
        {selectedStep && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-2 p-3 rounded-xl glass text-xs text-zinc-300 border border-athena-accent/30 flex items-center justify-between gap-3"
          >
            <div>
              <span className="font-semibold text-white">{selectedStep.name} Stage:</span>{" "}
              <span>{selectedStep.detail}</span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedStep(null)}
              className="text-zinc-500 hover:text-zinc-300 text-[11px] underline shrink-0"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
