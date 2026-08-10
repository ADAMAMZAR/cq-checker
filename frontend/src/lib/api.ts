import type {
  AuditLog,
  AuditRegistryEntry,
  DocumentEvidence,
  SupplierEntry,
  SupplierAssets,
  CostAnalyticsData,
  ChatResponse,
  ChatHistoryResponse,
  ChatStreamDone,
  ChatSource,
  DocumentIngestResult,
  DocumentSummary,
  CertificateVerifyResult,
  SupplierAuditResponse,
  DbTableMeta,
  DbTableData,
  DbSchema,
} from "@/types";

// Single seam for backend routing.
// - Local dev: defaults to same-origin "/api", proxied by next.config rewrites.
// - Phase 8 static export: baked at build time to the Cloud Run URL via NEXT_PUBLIC_API_URL.
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

function base64url(input: string): string {
  const b64 = btoa(input);
  return b64.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/**
 * Resolve any stored file reference to a browser-fetchable URL.
 * - New uploads: storage returns relative "/api/files/local/..." -> prefix with API_BASE
 * - Legacy Supabase absolute URLs -> proxied through the backend /api/files/{b64url}
 * - Anything else -> returned untouched.
 */
export function buildFileUrl(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("/api/")) return `${API_BASE}${url.slice("/api".length)}`;
  if (/^https?:\/\//.test(url)) return `${API_BASE}/files/${base64url(url)}`;
  return url;
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail ?? data);
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function fetchAuditLogs(): Promise<AuditLog[]> {
  const res = await fetch(`${API_BASE}/logs`);
  if (!res.ok) throw new Error(`Failed to load logs: HTTP ${res.status}`);
  const data: AuditLog[] = await res.json();
  return data;
}

export async function fetchSuppliers(): Promise<SupplierEntry[]> {
  const res = await fetch(`${API_BASE}/suppliers`);
  if (!res.ok) throw new Error(`Failed to load suppliers: HTTP ${res.status}`);
  return res.json();
}

export async function fetchAuditRegistry(): Promise<AuditRegistryEntry[]> {
  const res = await fetch(`${API_BASE}/audit-registry`);
  if (!res.ok) throw new Error(`Failed to load audit registry: HTTP ${res.status}`);
  return res.json();
}

export async function fetchSupplierEvidence(supplierId: number): Promise<SupplierAssets> {
  const res = await fetch(`${API_BASE}/logs/${supplierId}/evidence`);
  if (!res.ok) throw new Error(`Failed to load supplier evidence: HTTP ${res.status}`);
  return res.json();
}

export const fetchSupplierAssets = fetchSupplierEvidence;

export async function fetchCostAnalytics(): Promise<CostAnalyticsData> {
  const res = await fetch(`${API_BASE}/costs`);
  if (!res.ok) throw new Error(`Failed to load cost analytics: HTTP ${res.status}`);
  return res.json();
}

export async function fetchEvidenceLogs(): Promise<DocumentEvidence[]> {
  const res = await fetch(`${API_BASE}/evidence`);
  if (!res.ok) throw new Error(`Failed to load evidence logs: HTTP ${res.status}`);
  return res.json();
}

export interface EvidenceUpdateResponse {
  status: string;
  message: string;
  audit_result?: string;
  suggested_comment?: string;
  comparison_table?: unknown;
}

export async function updateEvidenceMetadata(
  auditId: string,
  filename: string,
  updatedMetadata: Record<string, string>
): Promise<EvidenceUpdateResponse> {
  const res = await fetch(`${API_BASE}/evidence`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audit_id: auditId, filename, updated_metadata: updatedMetadata })
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return res.json();
}

// ── RAG Chatbot ──────────────────────────────────────────────────────────────

export interface ChatStreamCallbacks {
  onDelta: (text: string) => void;
}

/**
 * Stream a RAG answer over SSE. Falls back gracefully to a plain JSON response
 * if the server/proxy does not emit text/event-stream.
 */
export async function sendChat(
  query: string,
  sessionId: string | null,
  callbacks: ChatStreamCallbacks,
  signal?: AbortSignal
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, session_id: sessionId, stream: true }),
    signal,
  });
  if (!res.ok) throw new Error(await errorDetail(res));

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const data = (await res.json()) as ChatResponse;
    callbacks.onDelta(data.answer);
    return data;
  }

  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let done: ChatStreamDone | null = null;
  let streamError: Error | null = null;

  while (reader && !streamError) {
    const { value, done: streamDone } = await reader.read();
    if (streamDone) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIdx = buffer.indexOf("\n\n");
    while (sepIdx !== -1) {
      const block = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const event = JSON.parse(raw);
          if (event.error) {
            streamError = new Error(event.error);
            break;
          }
          if (typeof event.delta === "string") {
            answer += event.delta;
            callbacks.onDelta(event.delta);
          } else if (event.done) {
            done = event;
          }
        } catch {
          // ignore malformed events
        }
      }
      if (streamError) break;
      sepIdx = buffer.indexOf("\n\n");
    }
  }
  if (streamError) throw streamError;
  if (reader) await reader.cancel().catch(() => { });

  if (!done) {
    done = { done: true, sources: [], cost_usd: 0, cache_hit: false, session_id: sessionId };
  }

  return {
    answer: (done as any).answer || answer,
    sources: done.sources ?? [],
    cost_usd: done.cost_usd ?? 0,
    cache_hit: !!done.cache_hit,
    session_id: done.session_id ?? sessionId,
  };
}

export async function fetchChatHistory(sessionId: string): Promise<ChatHistoryResponse> {
  const res = await fetch(`${API_BASE}/chat/history?session_id=${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new Error(await errorDetail(res));
  return res.json();
}

export async function clearChatCache(): Promise<number> {
  const res = await fetch(`${API_BASE}/chat/cache/clear`, { method: "POST" });
  if (!res.ok) throw new Error(await errorDetail(res));
  const data = await res.json();
  return data.cleared ?? 0;
}

// ── Document Ingestion ───────────────────────────────────────────────────────

export async function uploadDocument(file: File, title?: string): Promise<DocumentIngestResult> {
  const form = new FormData();
  form.append("file", file);
  if (title) form.append("title", title);
  const res = await fetch(`${API_BASE}/documents/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await errorDetail(res));
  return res.json();
}

export async function fetchDocuments(): Promise<DocumentSummary[]> {
  const res = await fetch(`${API_BASE}/documents`);
  if (!res.ok) throw new Error(await errorDetail(res));
  return res.json();
}

// ── Certificate Verification ─────────────────────────────────────────────────

export interface VerifyCertificateOptions {
  supplierName: string;
  questionLabel?: string;
  qaAnswers?: string;
  qaDataTitle?: string;
}

export async function verifyCertificate(
  file: File,
  opts: VerifyCertificateOptions
): Promise<CertificateVerifyResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("supplier_name", opts.supplierName);
  if (opts.questionLabel) form.append("question_label", opts.questionLabel);
  if (opts.qaAnswers) form.append("qa_answers", opts.qaAnswers);
  if (opts.qaDataTitle) form.append("qa_data_title", opts.qaDataTitle);
  const res = await fetch(`${API_BASE}/certificates/verify`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await errorDetail(res));
  return res.json();
}

export async function fetchCertificates(): Promise<SupplierAuditResponse[]> {
  const res = await fetch(`${API_BASE}/certificates`);
  if (!res.ok) throw new Error(await errorDetail(res));
  return res.json();
}

// ── Database Browser (read-only preview) ─────────────────────────────────────

export async function fetchDbTables(): Promise<DbTableMeta[]> {
  const res = await fetch(`${API_BASE}/db/tables`);
  if (!res.ok) throw new Error(await errorDetail(res));
  return res.json();
}

export async function fetchDbTable(
  table: string,
  limit: number = 100,
  offset: number = 0
): Promise<DbTableData> {
  const res = await fetch(
    `${API_BASE}/db/tables/${encodeURIComponent(table)}?limit=${limit}&offset=${offset}`
  );
  if (!res.ok) throw new Error(await errorDetail(res));
  return res.json();
}

export async function deleteDbRow(table: string, pk: Record<string, string>): Promise<void> {
  const res = await fetch(`${API_BASE}/db/tables/${encodeURIComponent(table)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pk }),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
}

export async function fetchDbSchema(): Promise<DbSchema> {
  const res = await fetch(`${API_BASE}/db/schema`);
  if (!res.ok) throw new Error(await errorDetail(res));
  return res.json();
}

export type { ChatSource };
