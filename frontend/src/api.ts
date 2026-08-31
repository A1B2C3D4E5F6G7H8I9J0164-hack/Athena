export interface Citation {
  id: string;
  label: string;
  source_type: string;
  url: string;
  excerpt: string;
}

export interface AgentStep {
  name: string;
  detail: string;
  status: string;
}

export interface QueryResponse {
  answer: string;
  citations: Citation[];
  sources_used: string[];
  route: string;
  plan: string;
  steps: AgentStep[];
  latency_ms: number;
  tokens_used: number;
  session_id: string;
  faithfulness_score?: number | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  steps?: AgentStep[];
  route?: string;
  latency_ms?: number;
  faithfulness_score?: number | null;
  isLoading?: boolean;
}

export interface HealthResponse {
  status: string;
  documents_indexed: number;
  llm_provider: string;
}

export interface MetricsResponse {
  total_queries: number;
  avg_latency_ms: number;
  avg_tokens: number;
  route_breakdown: Record<string, number>;
  retrieval_precision_at_1: number | null;
  note: string;
}

export interface DocumentInfo {
  source_id: string;
  source_path: string;
  file_type: string;
  chunk_count: number;
  ingested_at: string;
}

export interface HistoryItem {
  id: number;
  session_id: string;
  query: string;
  answer: string;
  route: string;
  latency_ms: number;
  created_at: string;
}

export type RouteMode = "auto" | "rag" | "web" | "both";

const API_BASE = import.meta.env.VITE_API_URL || "";

export async function sendQuery(
  query: string,
  sessionId: string | null,
  history: { role: string; content: string }[],
  routeOverride: RouteMode = "auto"
): Promise<QueryResponse> {
  const res = await fetch(`${API_BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      session_id: sessionId,
      history,
      route_override: routeOverride,
    }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function streamQuery(
  query: string,
  sessionId: string | null,
  history: { role: string; content: string }[],
  routeOverride: RouteMode,
  onStep: (step: AgentStep) => void,
  onDone: (result: QueryResponse) => void,
  onError: (msg: string) => void
): () => void {
  const controller = new AbortController();

  fetch(`${API_BASE}/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      session_id: sessionId,
      history,
      route_override: routeOverride,
    }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok || !res.body) throw new Error(`Stream error: ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          let event = "message";
          let data = "";
          for (const line of part.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            if (line.startsWith("data:")) data = line.slice(5).trim();
          }
          if (!data) continue;
          const parsed = JSON.parse(data);
          if (event === "step") onStep(parsed);
          else if (event === "done") onDone(parsed);
          else if (event === "error") onError(parsed.message);
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") onError(err.message);
    });

  return () => controller.abort();
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

export async function fetchMetrics(): Promise<MetricsResponse> {
  const res = await fetch(`${API_BASE}/metrics`);
  return res.json();
}

export async function fetchDocuments(): Promise<DocumentInfo[]> {
  const res = await fetch(`${API_BASE}/documents`);
  return res.json();
}

export interface ChunkDetail {
  chunk_id: string;
  text: string;
  page_number: number;
  source_id: string;
}

export interface DocumentChunksResponse {
  source_id: string;
  total_chunks: number;
  chunks: ChunkDetail[];
}

export interface SearchResultItem {
  chunk_id: string;
  text: string;
  citation: string;
  rerank_score?: number | null;
}

export interface SearchResponse {
  query: string;
  results: SearchResultItem[];
  elapsed_ms: number;
}

export async function uploadDocument(file: File): Promise<{ filename: string; chunks_stored: number; message: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/documents/upload`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Upload failed");
  }
  return res.json();
}

export async function ingestUrl(url: string): Promise<{ filename: string; chunks_stored: number; message: string }> {
  const res = await fetch(`${API_BASE}/documents/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "URL ingestion failed");
  }
  return res.json();
}

export async function deleteDocument(sourceId: string): Promise<{ source_id: string; deleted: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/documents/${encodeURIComponent(sourceId)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Delete failed");
  }
  return res.json();
}

export async function fetchDocumentChunks(sourceId: string): Promise<DocumentChunksResponse> {
  const res = await fetch(`${API_BASE}/documents/${encodeURIComponent(sourceId)}/chunks`);
  if (!res.ok) throw new Error(`Failed to fetch chunks: ${res.statusText}`);
  return res.json();
}

export async function submitFeedback(
  query: string,
  answer: string,
  rating: number,
  sessionId?: string,
  comment?: string
): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, answer, rating, session_id: sessionId, comment }),
  });
  if (!res.ok) throw new Error("Failed to submit feedback");
  return res.json();
}

export async function rawSearch(query: string, topK = 6): Promise<SearchResponse> {
  const res = await fetch(`${API_BASE}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k: topK }),
  });
  if (!res.ok) throw new Error("Search query failed");
  return res.json();
}

export async function fetchHistory(limit = 50): Promise<HistoryItem[]> {
  const res = await fetch(`${API_BASE}/history?limit=${limit}`);
  return res.json();
}

export function exportChatMarkdown(messages: ChatMessage[]): string {
  const lines = ["# Athena Research Session\n", `*Generated on ${new Date().toLocaleString()}*\n\n---\n`];
  for (const m of messages) {
    if (m.role === "user") {
      lines.push(`### User Query\n> **${m.content}**\n`);
    } else if (!m.isLoading) {
      lines.push(`### Athena Synthesized Answer\n${m.content}\n`);
      if (m.route) {
        lines.push(`*Route:* \`${m.route}\` | *Latency:* ${m.latency_ms?.toFixed(0)}ms\n`);
      }
      if (m.citations?.length) {
        lines.push("#### Citations & Verified Sources");
        m.citations.forEach((c) => {
          lines.push(`- **[${c.id}] ${c.label}** (${c.source_type})\n  > "${c.excerpt}"\n  ${c.url ? `Link: ${c.url}` : ""}`);
        });
        lines.push("");
      }
      lines.push("---\n");
    }
  }
  return lines.join("\n");
}

export function exportChatJson(messages: ChatMessage[]): string {
  return JSON.stringify({
    title: "Athena Research Session",
    exported_at: new Date().toISOString(),
    messages: messages.filter(m => !m.isLoading),
  }, null, 2);
}

// --- Authentication & OAuth API ---
export interface AuthResult {
  access_token: string;
  token_type: string;
  user: {
    id?: string;
    name: string;
    email: string;
    avatar_url?: string;
    auth_provider?: string;
    created_at?: string;
  };
}

export async function apiSignup(name: string, email: string, password: string): Promise<AuthResult> {
  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Signup failed" }));
    throw new Error(err.detail || "Signup failed");
  }
  return res.json();
}

export async function apiLogin(email: string, password: string): Promise<AuthResult> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Invalid email or password" }));
    throw new Error(err.detail || "Invalid email or password");
  }
  return res.json();
}

export async function apiOAuth(provider: "google" | "github", details?: { email?: string; name?: string; avatar_url?: string }): Promise<AuthResult> {
  const res = await fetch(`${API_BASE}/auth/oauth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, ...details }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "OAuth authentication failed" }));
    throw new Error(err.detail || "OAuth authentication failed");
  }
  return res.json();
}


