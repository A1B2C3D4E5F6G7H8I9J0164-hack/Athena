import { useState } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import {
  User,
  Bot,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  ShieldCheck,
  Clock,
  Globe,
  Database,
  Layers,
} from "lucide-react";
import type { ChatMessage } from "../api";
import { submitFeedback } from "../api";
import AgentPipeline from "./AgentPipeline";
import CitationCards from "./CitationCards";
import { AudioReaderButton } from "./AudioControls";

interface Props {
  message: ChatMessage;
  queryContext?: string;
  sessionId?: string | null;
}

export default function MessageBubble({ message, queryContext, sessionId }: Props) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<number | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFeedback = async (rating: number) => {
    if (feedbackRating !== null) return;
    setFeedbackRating(rating);
    try {
      await submitFeedback(
        queryContext || "Query",
        message.content,
        rating,
        sessionId || undefined
      );
    } catch (e) {
      console.error(e);
    }
  };

  const getRouteIcon = (route?: string) => {
    if (route === "web") return <Globe className="w-3 h-3 text-athena-cyan" />;
    if (route === "rag") return <Database className="w-3 h-3 text-athena-accent" />;
    return <Layers className="w-3 h-3 text-athena-glow" />;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 280, damping: 26 }}
      className={`flex gap-3.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      <motion.div
        whileHover={{ scale: 1.08, rotate: isUser ? -5 : 5 }}
        className={`flex-shrink-0 w-9 h-9 rounded-2xl flex items-center justify-center shadow-lg transition-transform ${
          isUser
            ? "bg-gradient-to-tr from-athena-accent to-purple-500 text-white shadow-athena-accent/20"
            : "glass glow-border text-athena-cyan shadow-cyan-500/10"
        }`}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </motion.div>

      {/* Message Box */}
      <div className={`flex-1 max-w-[88%] ${isUser ? "text-right" : "text-left"}`}>
        <div
          className={`inline-block rounded-2xl p-4 sm:p-5 shadow-xl ${
            isUser
              ? "bg-gradient-to-br from-athena-accent/20 to-purple-600/15 border border-athena-accent/30 text-zinc-100 text-left"
              : "glass glow-border text-zinc-100 w-full"
          }`}
        >
          {message.isLoading ? (
            <div className="flex items-center gap-3 py-2">
              <div className="flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-athena-accent to-athena-cyan"
                    animate={{ y: [0, -7, 0], opacity: [0.35, 1, 0.35] }}
                    transition={{
                      duration: 0.85,
                      repeat: Infinity,
                      delay: i * 0.16,
                    }}
                  />
                ))}
              </div>
              <span className="text-xs text-zinc-400 font-medium">
                Athena is researching and synthesizing verified claims...
              </span>
            </div>
          ) : (
            <div className="prose-dark overflow-hidden">
              <ReactMarkdown
                components={{
                  code({ className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || "");
                    const isInline = !match && !String(children).includes("\n");

                    if (isInline) {
                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    }

                    const codeString = String(children).replace(/\n$/, "");
                    const lang = match ? match[1] : "code";

                    return (
                      <div className="relative group my-3 rounded-xl overflow-hidden border border-white/10 bg-[#08080d]">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.04] border-b border-white/5 text-[11px] text-zinc-400">
                          <span className="font-mono uppercase">{lang}</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(codeString);
                            }}
                            className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white px-2 py-0.5 rounded hover:bg-white/5 transition-colors"
                          >
                            <Copy className="w-3 h-3" /> Copy
                          </button>
                        </div>
                        <pre className="p-3 text-xs overflow-x-auto font-mono text-zinc-200">
                          <code>{codeString}</code>
                        </pre>
                      </div>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Agent pipeline steps */}
        {!isUser && message.steps && message.steps.length > 0 && (
          <div className="mt-3">
            <AgentPipeline steps={message.steps} isActive={false} />
          </div>
        )}

        {/* Citations */}
        {!isUser && message.citations && message.citations.length > 0 && (
          <CitationCards citations={message.citations} />
        )}

        {/* Response Footer Actions / Metadata */}
        {!isUser && !message.isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-2.5 flex items-center justify-between gap-3 text-xs text-zinc-500 flex-wrap px-1"
          >
            {/* Badges */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {message.route && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/5 text-[11px] uppercase font-semibold tracking-wider text-zinc-300">
                  {getRouteIcon(message.route)}
                  <span>{message.route}</span>
                </span>
              )}

              {message.latency_ms !== undefined && (
                <span className="flex items-center gap-1 text-zinc-400 text-[11px]">
                  <Clock className="w-3 h-3" />
                  <span>{message.latency_ms.toFixed(0)}ms</span>
                </span>
              )}

              {message.faithfulness_score != null && (
                <span
                  title="Faithfulness score: percentage of claims backed by verified inline citations"
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                    message.faithfulness_score >= 0.8
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                  }`}
                >
                  <ShieldCheck className="w-3 h-3" />
                  <span>{Math.round(message.faithfulness_score * 100)}% Verified</span>
                </span>
              )}
            </div>

            {/* Quick action buttons */}
            <div className="flex items-center gap-1.5 ml-auto">
              <AudioReaderButton text={message.content} />

              <button
                type="button"
                onClick={handleCopy}
                title="Copy Answer Markdown"
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors flex items-center gap-1 text-[11px]"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
              </button>

              <div className="flex items-center border-l border-white/10 pl-1.5 ml-1">
                <button
                  type="button"
                  onClick={() => handleFeedback(1)}
                  title="Accurate and helpful"
                  className={`p-1.5 rounded-lg transition-colors ${
                    feedbackRating === 1
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                  }`}
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleFeedback(-1)}
                  title="Needs improvement"
                  className={`p-1.5 rounded-lg transition-colors ${
                    feedbackRating === -1
                      ? "bg-rose-500/20 text-rose-400"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                  }`}
                >
                  <ThumbsDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
