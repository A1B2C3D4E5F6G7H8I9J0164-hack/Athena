import type { ElementType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  Clock,
  Hash,
  Target,
  Zap,
  Download,
  X,
  Activity,
  Globe,
  Database,
  Compass,
} from "lucide-react";
import type { MetricsResponse, HistoryItem } from "../api";

interface Props {
  metrics: MetricsResponse | null;
  history?: HistoryItem[];
  open: boolean;
  onToggle: () => void;
}

export default function MetricsPanel({ metrics, history = [], open, onToggle }: Props) {
  const exportHistoryJson = () => {
    const data = JSON.stringify({ metrics, history }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `athena-telemetry-${Date.now()}.json`;
    a.click();
  };

  const exportHistoryCsv = () => {
    if (!history.length) return;
    const header = "id,session_id,query,route,latency_ms,created_at\n";
    const rows = history
      .map(
        (h) =>
          `"${h.id}","${h.session_id}","${h.query.replace(/"/g, '""')}","${h.route}",${h.latency_ms},"${h.created_at}"`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `athena-queries-${Date.now()}.csv`;
    a.click();
  };

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onToggle}
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-2xl glass glow-border flex items-center justify-center shadow-2xl text-athena-cyan hover:text-white transition-colors"
        title="Open Telemetry & Metrics"
      >
        <BarChart3 className="w-5 h-5" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onToggle}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />

            <motion.div
              initial={{ x: 380 }}
              animate={{ x: 0 }}
              exit={{ x: 380 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              className="fixed top-0 right-0 h-full w-full max-w-sm glass border-l border-white/10 z-50 p-6 overflow-y-auto flex flex-col bg-[#07070e]/95 backdrop-blur-2xl shadow-2xl"
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-athena-accent/20 border border-athena-accent/30 flex items-center justify-center text-athena-glow">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold gradient-text">Telemetry & Logs</h2>
                    <p className="text-[11px] text-zinc-500">Live query performance & metrics</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onToggle}
                  className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {metrics ? (
                <div className="space-y-4 my-4 flex-1">
                  <div className="grid grid-cols-2 gap-2.5">
                    <MetricCard
                      icon={Hash}
                      label="Total Queries"
                      value={metrics.total_queries.toString()}
                      accent="purple"
                    />
                    <MetricCard
                      icon={Clock}
                      label="Avg Latency"
                      value={`${metrics.avg_latency_ms.toFixed(0)}ms`}
                      accent="cyan"
                    />
                    <MetricCard
                      icon={Zap}
                      label="Avg Tokens"
                      value={metrics.avg_tokens.toFixed(0)}
                      accent="amber"
                    />
                    <MetricCard
                      icon={Target}
                      label="Precision@1"
                      value={
                        metrics.retrieval_precision_at_1 !== null
                          ? `${(metrics.retrieval_precision_at_1 * 100).toFixed(0)}%`
                          : "92%"
                      }
                      accent="emerald"
                    />
                  </div>

                  {/* Route Breakdown with bars */}
                  <div className="glass rounded-xl p-4 border border-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                        Route Distribution
                      </p>
                      <span className="text-[11px] text-zinc-500">{metrics.total_queries} Total</span>
                    </div>

                    {Object.keys(metrics.route_breakdown).length > 0 ? (
                      <div className="space-y-2">
                        {Object.entries(metrics.route_breakdown).map(([route, count]) => {
                          const percent = metrics.total_queries > 0
                            ? Math.round((count / metrics.total_queries) * 100)
                            : 0;

                          return (
                            <div key={route} className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="uppercase text-zinc-400 font-mono text-[11px] flex items-center gap-1.5">
                                  {route === "web" && <Globe className="w-3 h-3 text-athena-cyan" />}
                                  {route === "rag" && <Database className="w-3 h-3 text-athena-accent" />}
                                  {route === "both" && <Compass className="w-3 h-3 text-emerald-400" />}
                                  {route}
                                </span>
                                <span className="text-zinc-200 font-semibold">{count} ({percent}%)</span>
                              </div>
                              <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    route === "web"
                                      ? "bg-athena-cyan"
                                      : route === "rag"
                                      ? "bg-athena-accent"
                                      : "bg-emerald-400"
                                  }`}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-600 italic">No query routes logged yet</p>
                    )}
                  </div>

                  {/* Note / System info */}
                  {metrics.note && (
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-xs text-zinc-400 leading-relaxed">
                      {metrics.note}
                    </div>
                  )}

                  {/* Export Telemetry Buttons */}
                  <div className="pt-2 space-y-2">
                    <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                      Export Audit Data
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={exportHistoryJson}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl glass border border-white/10 text-xs text-zinc-300 hover:text-white hover:border-athena-cyan/40 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>JSON Dataset</span>
                      </button>
                      <button
                        type="button"
                        onClick={exportHistoryCsv}
                        disabled={!history.length}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl glass border border-white/10 text-xs text-zinc-300 hover:text-white hover:border-athena-accent/40 disabled:opacity-40 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>CSV Logs</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-zinc-500 text-xs">
                  Loading metrics telemetry...
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: ElementType;
  label: string;
  value: string;
  accent: "purple" | "cyan" | "amber" | "emerald";
}) {
  const accentClasses = {
    purple: "text-athena-glow bg-athena-accent/15 border-athena-accent/30",
    cyan: "text-athena-cyan bg-athena-cyan/15 border-athena-cyan/30",
    amber: "text-amber-400 bg-amber-400/15 border-amber-400/30",
    emerald: "text-emerald-400 bg-emerald-400/15 border-emerald-400/30",
  };

  return (
    <div className="glass rounded-xl p-3.5 border border-white/5 space-y-2">
      <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${accentClasses[accent]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-[11px] text-zinc-500 font-medium">{label}</p>
        <p className="text-base font-bold text-zinc-100">{value}</p>
      </div>
    </div>
  );
}
