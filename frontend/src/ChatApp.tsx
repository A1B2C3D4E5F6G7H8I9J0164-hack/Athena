import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  streamQuery,
  fetchHealth,
  fetchMetrics,
  fetchDocuments,
  fetchHistory,
  exportChatMarkdown,
  exportChatJson,
} from "./api";
import type {
  ChatMessage,
  HealthResponse,
  MetricsResponse,
  DocumentInfo,
  HistoryItem,
  RouteMode,
} from "./api";
import MessageBubble from "./components/MessageBubble";
import InputBar from "./components/InputBar";
import AgentPipeline from "./components/AgentPipeline";
import MetricsPanel from "./components/MetricsPanel";
import KnowledgeVault from "./components/KnowledgeVault";
import RagLab from "./components/RagLab";
import HistoryPanel from "./components/HistoryPanel";
import AuthModal, { UserProfile } from "./components/AuthModal";
import {
  Plus,
  Download,
  History,
  PanelLeftClose,
  PanelLeft,
  Sliders,
  Database,
  Bot,
  Layers,
  Globe,
  Compass,
  ArrowRight,
  ShieldCheck,
  LogIn,
  UserPlus,
  LogOut,
  Key,
  Settings,
  ChevronDown,
} from "lucide-react";

type ActiveTab = "studio" | "raglab" | "vault" | "telemetry" | "showcase";

export default function ChatApp() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("studio");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [liveSteps, setLiveSteps] = useState<ChatMessage["steps"]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [docs, setDocs] = useState<DocumentInfo[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [routeMode, setRouteMode] = useState<RouteMode>("auto");

  // Auth State
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem("athena_user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<(() => void) | null>(null);

  const refreshMeta = useCallback(() => {
    fetchHealth().then(setHealth).catch(console.error);
    fetchMetrics().then(setMetrics).catch(console.error);
    fetchDocuments().then(setDocs).catch(console.error);
    fetchHistory().then(setHistory).catch(console.error);
  }, []);

  useEffect(() => {
    refreshMeta();
  }, [refreshMeta]);

  useEffect(() => {
    if (activeTab === "studio") {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, liveSteps, loading, activeTab]);

  const handleLoginSuccess = (profile: UserProfile) => {
    setUser(profile);
    try {
      localStorage.setItem("athena_user", JSON.stringify(profile));
    } catch {
      // ignore
    }
  };

  const handleLogout = () => {
    setUser(null);
    setUserDropdownOpen(false);
    try {
      localStorage.removeItem("athena_user");
    } catch {
      // ignore
    }
  };

  const openAuth = (mode: "login" | "signup") => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  const handleSend = (query: string) => {
    if (activeTab !== "studio") {
      setActiveTab("studio");
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: query,
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setLiveSteps([]);

    const hist = messages.map((m) => ({ role: m.role, content: m.content }));

    abortRef.current = streamQuery(
      query,
      sessionId,
      hist,
      routeMode,
      (step) => setLiveSteps((prev) => [...(prev || []), step]),
      (result) => {
        setSessionId(result.session_id);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: result.answer,
            citations: result.citations,
            steps: result.steps,
            route: result.route,
            latency_ms: result.latency_ms,
            faithfulness_score: result.faithfulness_score,
          },
        ]);
        setLoading(false);
        setLiveSteps([]);
        refreshMeta();
      },
      (err) => {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Error: ${err}. Please ensure the Athena backend server is running on port 8000.`,
          },
        ]);
        setLoading(false);
        setLiveSteps([]);
      }
    );
  };

  const newChat = () => {
    abortRef.current?.();
    setMessages([]);
    setSessionId(null);
    setLiveSteps([]);
    setLoading(false);
  };

  const exportChat = (format: "md" | "json") => {
    if (messages.length === 0) return;
    const content = format === "md" ? exportChatMarkdown(messages) : exportChatJson(messages);
    const mime = format === "md" ? "text/markdown" : "application/json";
    const blob = new Blob([content], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `athena-session-${Date.now()}.${format}`;
    a.click();
  };

  return (
    <div className="h-screen flex bg-[#000000] text-[#ffffff] overflow-hidden relative font-sans">
      <div className="grain" />

      {/* Sidebar Navigation */}
      <aside
        className={`${
          sidebarOpen ? "w-72" : "w-0"
        } flex-shrink-0 border-r border-white/10 bg-[#060608]/95 backdrop-blur-2xl transition-all duration-300 overflow-hidden flex flex-col z-30`}
      >
        {/* Brand header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 group">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <g transform="rotate(-30 12 12)">
                <circle cx="7.3" cy="3.2" r="1.45" />
                <rect x="5.5" y="4.7" width="3.6" height="14.6" rx="1.8" />
                <rect x="14.9" y="4.7" width="3.6" height="14.6" rx="1.8" />
                <circle cx="16.7" cy="20.8" r="1.45" />
              </g>
            </svg>
            <div>
              <span className="text-sm font-semibold tracking-tight text-white group-hover:opacity-85 transition-opacity">
                Athena<span className="font-normal text-zinc-400">.ai</span>
              </span>
              <span className="text-[10px] text-zinc-500 block font-mono">Autonomous Research</span>
            </div>
          </a>
          <a
            href="/"
            className="text-[11px] text-zinc-400 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-white/5 border border-transparent hover:border-white/10"
          >
            Landing ↗
          </a>
        </div>

        {/* Workspace Mode Tabs */}
        <div className="p-3 border-b border-white/5 space-y-1">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-2 mb-1">
            Workspaces
          </p>

          <button
            type="button"
            onClick={() => setActiveTab("studio")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === "studio"
                ? "glass-pill text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Bot className="w-4 h-4 text-zinc-300" />
              <span>Research Studio</span>
            </div>
            {messages.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-zinc-300 font-mono">
                {messages.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("raglab")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === "raglab"
                ? "glass-pill text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
            }`}
          >
            <Sliders className="w-4 h-4 text-zinc-300" />
            <span>RAG Laboratory</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("vault")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === "vault"
                ? "glass-pill text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Database className="w-4 h-4 text-zinc-300" />
              <span>Knowledge Vault</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">
              {docs.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("showcase")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === "showcase"
                ? "glass-pill text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
            }`}
          >
            <Compass className="w-4 h-4 text-zinc-300" />
            <span>Architecture & Specs</span>
          </button>
        </div>

        {/* Route Selector in Sidebar */}
        <div className="p-3 border-b border-white/5 space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              Retrieval Routing
            </p>
            <span className="text-[10px] text-zinc-400 font-mono capitalize">
              {routeMode}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: "auto", label: "Smart Auto", desc: "Auto routing", icon: Layers },
              { id: "rag", label: "Local KB", desc: "ChromaDB RAG", icon: Database },
              { id: "web", label: "Web Live", desc: "DuckDuckGo", icon: Globe },
              { id: "both", label: "Multi-Source", desc: "Hybrid + Web", icon: Compass },
            ].map((m) => {
              const Icon = m.icon;
              const active = routeMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setRouteMode(m.id as RouteMode)}
                  className={`p-2 rounded-lg text-left transition-all border ${
                    active
                      ? "bg-white/10 border-white/30 text-white shadow-sm"
                      : "border-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Icon className="w-3 h-3 text-zinc-300" />
                    <span className="text-xs font-medium">{m.label}</span>
                  </div>
                  <span className="text-[9px] text-zinc-500 block truncate">{m.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Knowledge Preview */}
        <div className="p-3 flex-1 overflow-y-auto space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              Knowledge Sources ({docs.length})
            </p>
            <button
              type="button"
              onClick={() => setActiveTab("vault")}
              className="text-[10px] text-zinc-400 hover:text-white underline"
            >
              Manage
            </button>
          </div>

          {docs.length === 0 ? (
            <p className="text-xs text-zinc-600 px-1 italic">No documents indexed yet</p>
          ) : (
            <div className="space-y-1">
              {docs.slice(0, 5).map((d) => (
                <div
                  key={d.source_id}
                  onClick={() => setActiveTab("vault")}
                  className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 cursor-pointer flex items-center justify-between group transition-colors"
                >
                  <span className="truncate flex-1 group-hover:text-white">{d.source_id}</span>
                  <span className="text-[10px] text-zinc-500 ml-1 font-mono">{d.chunk_count}c</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Actions & User Profile */}
        <div className="mt-auto p-3 border-t border-white/10 space-y-2 bg-[#040406]">
          {!user ? (
            <div className="grid grid-cols-2 gap-1.5 pb-1">
              <button
                type="button"
                onClick={() => openAuth("login")}
                className="btn-ghost flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-md text-xs font-medium text-zinc-300 hover:text-white"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Log In</span>
              </button>
              <button
                type="button"
                onClick={() => openAuth("signup")}
                className="btn-solid flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-md text-xs font-semibold text-zinc-900"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Sign Up</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.04] border border-white/10">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-md bg-white text-black font-bold flex items-center justify-center text-xs shrink-0">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-zinc-200 truncate">{user.name}</p>
                  <p className="text-[10px] text-zinc-500 truncate">{user.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-white/10 transition-colors"
                title="Log Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={newChat}
            className="btn-ghost w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium text-zinc-300 hover:text-white"
          >
            <Plus className="w-4 h-4 text-zinc-300" /> New Research Session
          </button>

          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-white/10 transition-colors"
            >
              <History className="w-3.5 h-3.5" /> History ({history.length})
            </button>

            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => exportChat("md")}
                title="Export session to Markdown"
                className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-white/10 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Export
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative z-10">
        {/* App Header */}
        <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-white/10 bg-[#000000]/90 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
              title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            </button>

            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-white/80" />
              <span className="text-xs font-semibold text-zinc-200 hidden sm:inline tracking-tight">
                {activeTab === "studio" && "Research Studio"}
                {activeTab === "raglab" && "Hybrid RAG Laboratory"}
                {activeTab === "vault" && "Knowledge Vault"}
                {activeTab === "showcase" && "System Architecture & Specs"}
              </span>
            </div>
          </div>

          {/* Right Header Navigation Actions */}
          <div className="flex items-center gap-3 text-xs">
            {health && (
              <div className="hidden md:flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-[11px] font-mono text-zinc-400">
                  {health.documents_indexed} vectors
                </span>
                <span className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-zinc-300 text-[11px] font-mono capitalize">
                  {health.llm_provider}
                </span>
              </div>
            )}

            {/* Auth Buttons */}
            {!user ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openAuth("login")}
                  className="btn-ghost px-3.5 py-1.5 rounded-md text-xs font-medium text-zinc-300 hover:text-white"
                >
                  <LogIn className="w-3.5 h-3.5 inline mr-1" />
                  <span>Log In</span>
                </button>

                <button
                  type="button"
                  onClick={() => openAuth("signup")}
                  className="btn-solid px-4 py-1.5 rounded-md text-xs font-semibold text-zinc-900"
                >
                  <UserPlus className="w-3.5 h-3.5 inline mr-1" />
                  <span>Sign Up</span>
                </button>
              </div>
            ) : (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md glass border border-white/15 hover:border-white/30 transition-all text-xs"
                >
                  <div className="w-6 h-6 rounded-md bg-white text-black font-bold flex items-center justify-center text-[11px]">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-zinc-200 font-medium hidden sm:inline">{user.name}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                </button>

                {/* Dropdown Menu */}
                <AnimatePresence>
                  {userDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      className="absolute right-0 mt-2 w-48 rounded-xl glass p-2 bg-[#09090c] shadow-2xl z-50 border border-white/15 space-y-1"
                    >
                      <div className="px-3 py-2 border-b border-white/10 mb-1">
                        <p className="text-xs font-semibold text-zinc-200 truncate">{user.name}</p>
                        <p className="text-[10px] text-zinc-500 truncate">{user.email}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setUserDropdownOpen(false);
                          setActiveTab("vault");
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-white/5 transition-colors"
                      >
                        <Database className="w-3.5 h-3.5 text-zinc-400" /> Knowledge Base
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setUserDropdownOpen(false);
                          setMetricsOpen(true);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-white/5 transition-colors"
                      >
                        <Key className="w-3.5 h-3.5 text-zinc-400" /> API Usage & Keys
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setUserDropdownOpen(false);
                          alert("User settings panel");
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-white/5 transition-colors"
                      >
                        <Settings className="w-3.5 h-3.5 text-zinc-400" /> Settings
                      </button>

                      <div className="pt-1 border-t border-white/10">
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-rose-400 hover:bg-rose-500/10 transition-colors"
                        >
                          <LogOut className="w-3.5 h-3.5" /> Sign Out
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </header>

        {/* Tab Views */}
        {activeTab === "studio" && (
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-6">
              {messages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="max-w-2xl mx-auto text-center mt-12 sm:mt-16 space-y-6"
                >
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-white/15 bg-white/[0.03] text-xs text-zinc-300">
                    <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="white">
                      <path d="M12 2.6C12.55 2.6 12.88 3.15 13.08 4.7c.62 4.7 1.52 5.6 6.22 6.22 1.55.2 2.1.53 2.1 1.08s-.55.88-2.1 1.08c-4.7.62-5.6 1.52-6.22 6.22-.2 1.55-.53 2.1-1.08 2.1s-.88-.55-1.08-2.1c-.62-4.7-1.52-5.6-6.22-6.22C3.15 12.88 2.6 12.55 2.6 12s.55-.88 2.1-1.08c4.7-.62 5.6-1.52 6.22-6.22C11.12 3.15 11.45 2.6 12 2.6Z" />
                    </svg>
                    <span>Operational AI Infrastructure</span>
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-3xl sm:text-4xl font-normal text-white tracking-tight">
                      Synthesize research with <span className="serif-accent font-normal text-3xl sm:text-4xl">AI agents</span>
                    </h2>
                    <p className="text-zinc-400 text-sm max-w-lg mx-auto leading-relaxed">
                      Athena routes your queries across indexed knowledge vectors and live web search, returning verified claims with inline source citations.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left pt-4">
                    <div className="glass rounded-xl p-4 border border-white/10 space-y-1.5">
                      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white">
                        <Layers className="w-4 h-4" />
                      </div>
                      <h4 className="text-xs font-semibold text-zinc-200">Hybrid RAG</h4>
                      <p className="text-[11px] text-zinc-400">
                        Dense MiniLM + BM25 + Reciprocal Rank Fusion + Reranking.
                      </p>
                    </div>

                    <div className="glass rounded-xl p-4 border border-white/10 space-y-1.5">
                      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white">
                        <Globe className="w-4 h-4" />
                      </div>
                      <h4 className="text-xs font-semibold text-zinc-200">Live Web Search</h4>
                      <p className="text-[11px] text-zinc-400">
                        DuckDuckGo real-time query expansion & freshness retrieval.
                      </p>
                    </div>

                    <div className="glass rounded-xl p-4 border border-white/10 space-y-1.5">
                      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <h4 className="text-xs font-semibold text-zinc-200">Cited Verification</h4>
                      <p className="text-[11px] text-zinc-400">
                        Inline citation mapping with automated faithfulness scoring.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Chat Message Stream */}
              {messages.map((msg, i) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  queryContext={msg.role === "assistant" ? messages[i - 1]?.content : undefined}
                  sessionId={sessionId}
                />
              ))}

              {/* Live Streaming State */}
              {loading && (
                <div className="space-y-4">
                  <AgentPipeline steps={liveSteps || []} isActive={true} />
                  <MessageBubble
                    message={{
                      id: "loading-stream",
                      role: "assistant",
                      content: "",
                      isLoading: true,
                    }}
                  />
                </div>
              )}
            </div>

            {/* Input Bar */}
            <InputBar
              onSend={handleSend}
              disabled={loading}
              routeMode={routeMode}
              onRouteChange={setRouteMode}
            />
          </div>
        )}

        {/* RAG Lab View */}
        {activeTab === "raglab" && <RagLab />}

        {/* Knowledge Vault View */}
        {activeTab === "vault" && (
          <KnowledgeVault documents={docs} onRefresh={refreshMeta} />
        )}

        {/* Architecture & Showcase View */}
        {activeTab === "showcase" && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 max-w-5xl mx-auto w-full">
            <div className="glass rounded-xl p-6 relative overflow-hidden">
              <h2 className="text-2xl sm:text-3xl font-medium text-white mb-2">
                Operational <span className="serif-accent text-2xl sm:text-3xl">AI Architecture</span>
              </h2>
              <p className="text-zinc-400 text-sm max-w-2xl leading-relaxed">
                Multi-stage autonomous research pipeline orchestrated by LangGraph, ChromaDB vector store, BM25 Okapi lexical index, Reciprocal Rank Fusion, and Cross-Encoder reranking.
              </p>
            </div>

            <div className="glass rounded-xl p-6 space-y-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                LangGraph State Machine Pipeline
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                {[
                  { step: "1. Plan", desc: "Analyzes query intent, decomposes complex requests, selects optimal retrieval strategy." },
                  { step: "2. Route", desc: "Routes query to Hybrid RAG (local docs), Live Web Search, or Both." },
                  { step: "3. Retrieve", desc: "MiniLM embeddings + BM25 sparse index merged via Reciprocal Rank Fusion + Reranking." },
                  { step: "4. Synthesize & Cite", desc: "Generates answer with inline [n] references and validates faithfulness score." },
                ].map((s) => (
                  <div key={s.step} className="p-4 rounded-lg bg-black/40 border border-white/10 space-y-1.5">
                    <h4 className="text-xs font-semibold text-white">{s.step}</h4>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">{s.desc}</p>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-lg bg-white/[0.03] border border-white/10 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-zinc-200">Interactive Features Active</h4>
                  <p className="text-[11px] text-zinc-500">Speech recognition, audio reader, chunk inspection, telemetry export.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("studio")}
                  className="btn-solid px-4 py-2 rounded-md text-xs font-semibold flex items-center gap-1.5"
                >
                  <span>Launch Research Studio</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        initialMode={authMode}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleLoginSuccess}
      />

      {/* Floating Telemetry Drawer */}
      <MetricsPanel
        metrics={metrics}
        history={history}
        open={metricsOpen}
        onToggle={() => setMetricsOpen(!metricsOpen)}
      />

      {/* Query History Drawer */}
      <HistoryPanel
        items={history}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelect={(item) => {
          setHistoryOpen(false);
          setActiveTab("studio");
          setMessages([
            { id: "hist-q", role: "user", content: item.query },
            {
              id: "hist-a",
              role: "assistant",
              content: item.answer,
              route: item.route,
              latency_ms: item.latency_ms,
            },
          ]);
        }}
      />
    </div>
  );
}
