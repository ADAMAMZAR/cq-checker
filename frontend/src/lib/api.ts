import type {
  AuditLog,
  AuditRegistryEntry,
  AuditRegistryDetail,
  DocumentEvidence,
  DocumentEvidenceSummary,
  SupplierEntry,
  SupplierAssets,
  CostAnalyticsData,
  ChatResponse,
  ChatHistoryResponse,
  ChatStreamDone,
  ChatSource,
  DocumentIngestResult,
  DocumentSummary,
  DocumentFolder,
  CertificateVerifyResult,
  SupplierAuditResponse,
  DbTableMeta,
  DbTableData,
  DbSchema,
  FeedbackRating,
  FeedbackResponse,
  RolesAndFeaturesResponse,
} from "@/types";

import { getStoredUserEmail, setStoredUserEmail } from "./securityStore";

// ── Base API Configuration ───────────────────────────────────────────────────

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export const UPLOAD_API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://127.0.0.1:8000/api"
    : API_BASE);

const INTERNAL_SECRET = process.env.NEXT_PUBLIC_INTERNAL_API_SECRET || "dev-internal-secret-cq-checker";

// ── Custom Error Classes ──────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Session expired or unauthorized. Please sign in.") {
    super(401, "Unauthorized", message);
    this.name = "UnauthorizedError";
  }
}

export async function errorDetail(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data.detail === "string") return data.detail;
    if (data.detail) return JSON.stringify(data.detail);
    if (typeof data.message === "string") return data.message;
    return JSON.stringify(data);
  } catch {
    return `HTTP ${res.status}: ${res.statusText || "Request failed"}`;
  }
}

// ── Authentication & Network Interceptors ───────────────────────────────────

export function getAuthHeaders(extraHeaders: HeadersInit = {}): HeadersInit {
  const headers = new Headers(extraHeaders);
  if (INTERNAL_SECRET) {
    headers.set("X-Internal-Secret", INTERNAL_SECRET);
  }
  const userEmail = getStoredUserEmail();
  if (userEmail) {
    headers.set("X-User-Email", userEmail);
  }
  return headers;
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = getAuthHeaders(init.headers);
  const res = await fetch(input, { credentials: "include", ...init, headers });

  if (res.status === 401) {
    console.warn("API request returned 401 Unauthorized:", input);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("gpo-unauthorized-session-event"));
    }
  }

  if (res.status === 403 && typeof window !== "undefined") {
    res
      .clone()
      .json()
      .then((data) => {
        if (data?.provided_email) {
          setStoredUserEmail(data.provided_email);
        }
      })
      .catch((err) => {
        console.debug("Failed to extract provided_email from 403 response:", err);
      });
  }

  return res;
}

function base64url(input: string): string {
  const b64 = btoa(input);
  return b64.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function buildFileUrl(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("/api/")) return `${API_BASE}${url.slice("/api".length)}`;
  if (/^https?:\/\//.test(url)) return url;
  return url;
}

// ── DTO Type Definitions ──────────────────────────────────────────────────────

export interface AribaQuestionnaireItem {
  questionnaireId?: string;
  docId?: string;
  docTitle?: string;
  title?: string;
  hasCertificates?: boolean;
  status?: string;
  [key: string]: unknown;
}

export interface AribaQuestionnairesResponse {
  status: string;
  sm_vendor_id: string;
  total: number;
  questionnaires: AribaQuestionnaireItem[];
}

export interface AribaQuestionnaireAnswersResponse {
  status: string;
  sm_vendor_id: string;
  doc_id: string;
  qna_data: Record<string, unknown> | unknown[];
}

export interface EvidenceUpdateResponse {
  status: string;
  message: string;
  audit_result?: string;
  suggested_comment?: string;
  comparison_table?: unknown;
}

export interface MoveDocumentFolderResult {
  status: string;
  message?: string;
  document_id?: string;
  folder_id?: string | null;
  [key: string]: unknown;
}

export interface UpdateDocumentRegionResult {
  status: string;
  message?: string;
  document_id?: string;
  region?: string;
  [key: string]: unknown;
}

export interface DocumentContentResult {
  document_id: string;
  filename: string;
  title: string;
  content?: string;
  markdown?: string;
  pages?: Array<{ page_number: number; markdown: string }>;
  [key: string]: unknown;
}

export interface RetrievalTestPayload {
  query: string;
  k?: number;
  window_size?: number;
  vector_weight?: number;
  bm25_weight?: number;
  region_filter?: string;
}

export interface RetrievalTestResult {
  query: string;
  results: Array<{
    document_id: string;
    chunk_id: string;
    content: string;
    score: number;
    metadata?: Record<string, unknown>;
  }>;
  [key: string]: unknown;
}

export interface VerifyCertificateOptions {
  supplierName: string;
  questionLabel?: string;
  qaAnswers?: string;
  qaDataTitle?: string;
}

export interface AuditAribaSupplierResult {
  status: string;
  sm_vendor_id: string;
  doc_id?: string;
  audit_id?: string;
  summary?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DownloadAribaAttachmentsResult {
  status: string;
  downloaded_count?: number;
  attachments?: Array<{ filename: string; file_url?: string }>;
  [key: string]: unknown;
}

export interface TestIngestDocumentResult {
  status: string;
  filename: string;
  title?: string;
  total_pages?: number;
  pages?: Array<{ page_number: number; markdown: string }>;
  [key: string]: unknown;
}

export interface CommitIngestPagesResult {
  status: string;
  document_id?: string;
  message?: string;
  [key: string]: unknown;
}

// ── Audit & Supplier APIs ────────────────────────────────────────────────────

export async function fetchAuditLogs(): Promise<AuditLog[]> {
  const res = await authFetch(`${API_BASE}/logs`);
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function fetchSuppliers(): Promise<SupplierEntry[]> {
  const res = await authFetch(`${API_BASE}/suppliers`);
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function fetchAribaSuppliers(): Promise<SupplierEntry[]> {
  const res = await authFetch(`${API_BASE}/ariba/suppliers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function fetchAribaQuestionnaires(smVendorId: string): Promise<AribaQuestionnairesResponse> {
  const res = await authFetch(`${API_BASE}/ariba/suppliers/${encodeURIComponent(smVendorId)}/questionnaires`);
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function fetchAribaQuestionnaireAnswers(
  smVendorId: string,
  docId: string
): Promise<AribaQuestionnaireAnswersResponse> {
  const res = await authFetch(
    `${API_BASE}/ariba/suppliers/${encodeURIComponent(smVendorId)}/questionnaires/${encodeURIComponent(docId)}/answers`
  );
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function fetchAuditRegistry(): Promise<AuditRegistryEntry[]> {
  const res = await authFetch(`${API_BASE}/audit-registry`);
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function fetchAuditRegistryDetail(auditId: string): Promise<AuditRegistryDetail> {
  const res = await authFetch(`${API_BASE}/audit-registry/${encodeURIComponent(auditId)}`);
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function fetchSupplierEvidence(supplierId: number): Promise<SupplierAssets> {
  const res = await authFetch(`${API_BASE}/logs/${supplierId}/evidence`);
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export const fetchSupplierAssets = fetchSupplierEvidence;

export async function fetchCostAnalytics(): Promise<CostAnalyticsData> {
  const res = await authFetch(`${API_BASE}/costs`);
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function fetchEvidenceLogs(auditId?: string): Promise<DocumentEvidence[]> {
  const url = auditId ? `${API_BASE}/evidence?audit_id=${encodeURIComponent(auditId)}` : `${API_BASE}/evidence`;
  const res = await authFetch(url);
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function fetchEvidenceSummary(opts?: {
  supplierName?: string;
  supplierId?: number;
  auditId?: string;
}): Promise<DocumentEvidenceSummary[]> {
  const params = new URLSearchParams();
  if (opts?.supplierName) params.append("supplier_name", opts.supplierName);
  if (opts?.supplierId) params.append("supplier_id", opts.supplierId.toString());
  if (opts?.auditId) params.append("audit_id", opts.auditId);
  const queryStr = params.toString() ? `?${params.toString()}` : "";
  const res = await authFetch(`${API_BASE}/evidence/summary${queryStr}`);
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function fetchEvidenceDocument(documentId: string): Promise<DocumentEvidence> {
  const res = await authFetch(`${API_BASE}/evidence/${encodeURIComponent(documentId)}`);
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function updateEvidenceMetadata(
  auditId: string,
  filename: string,
  updatedMetadata: Record<string, string>
): Promise<EvidenceUpdateResponse> {
  const res = await authFetch(`${API_BASE}/evidence`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audit_id: auditId, filename, updated_metadata: updatedMetadata }),
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

// ── RAG Chatbot ──────────────────────────────────────────────────────────────

export interface ChatStreamCallbacks {
  onDelta: (text: string) => void;
}

export async function sendChat(
  query: string,
  sessionId: string | null,
  callbacks: ChatStreamCallbacks,
  signal?: AbortSignal
): Promise<ChatResponse> {
  const res = await authFetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, session_id: sessionId, stream: true }),
    signal,
  });

  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));

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
  let done: (ChatStreamDone & { answer?: string; debug_tracing?: unknown }) | null = null;
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
            streamError = new ApiError(500, "Internal Error", event.error);
            break;
          }
          if (typeof event.delta === "string") {
            answer += event.delta;
            callbacks.onDelta(event.delta);
          } else if (event.done) {
            done = event;
          }
        } catch (parseErr) {
          console.warn("Failed to parse SSE payload chunk:", raw, parseErr);
        }
      }

      if (streamError) break;
      sepIdx = buffer.indexOf("\n\n");
    }
  }

  if (streamError) throw streamError;
  if (reader) await reader.cancel().catch(() => {});

  if (!done) {
    done = { done: true, sources: [], cost_usd: 0, cache_hit: false, session_id: sessionId };
  }

  return {
    answer: done.answer || answer,
    sources: done.sources ?? [],
    cost_usd: done.cost_usd ?? 0,
    cache_hit: !!done.cache_hit,
    session_id: done.session_id ?? sessionId,
    message_id: done.message_id ?? null,
    debug_tracing: done.debug_tracing ?? null,
  };
}

export async function fetchChatHistory(sessionId: string): Promise<ChatHistoryResponse> {
  const res = await authFetch(`${API_BASE}/chat/history?session_id=${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function clearChatCache(): Promise<number> {
  const res = await authFetch(`${API_BASE}/chat/cache/clear`, { method: "POST" });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  const data = await res.json();
  return data.cleared ?? 0;
}

export async function submitFeedback(
  messageId: string,
  sessionId: string,
  rating: FeedbackRating,
  reason?: string
): Promise<FeedbackResponse> {
  const res = await authFetch(`${API_BASE}/chat/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message_id: messageId,
      session_id: sessionId,
      rating,
      reason: reason || null,
    }),
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

// ── Document Ingestion ───────────────────────────────────────────────────────

export async function uploadDocument(
  file: File,
  title?: string,
  overwrite: boolean = true
): Promise<DocumentIngestResult> {
  const form = new FormData();
  form.append("file", file);
  if (title) form.append("title", title);
  form.append("overwrite", overwrite.toString());

  const res = await authFetch(`${UPLOAD_API_BASE}/documents/upload`, { method: "POST", body: form });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function bulkUploadDocuments(
  files: File[],
  overwrite: boolean = true
): Promise<DocumentIngestResult[]> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  form.append("overwrite", overwrite.toString());

  const res = await authFetch(`${UPLOAD_API_BASE}/documents/bulk-upload`, { method: "POST", body: form });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function fetchDocuments(): Promise<DocumentSummary[]> {
  const res = await authFetch(`${API_BASE}/documents`);
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function fetchFolders(): Promise<DocumentFolder[]> {
  const res = await authFetch(`${API_BASE}/folders`);
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function createFolder(name: string): Promise<DocumentFolder> {
  const res = await authFetch(`${API_BASE}/folders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function updateFolder(folderId: string, name: string): Promise<DocumentFolder> {
  const res = await authFetch(`${API_BASE}/folders/${encodeURIComponent(folderId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function deleteFolder(folderId: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/folders/${encodeURIComponent(folderId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
}

export async function moveDocumentFolder(
  documentId: string,
  folderId: string | null
): Promise<MoveDocumentFolderResult> {
  const res = await authFetch(`${API_BASE}/documents/${encodeURIComponent(documentId)}/folder`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder_id: folderId }),
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function updateDocumentRegion(
  documentId: string,
  region: string
): Promise<UpdateDocumentRegionResult> {
  const res = await authFetch(`${API_BASE}/documents/${encodeURIComponent(documentId)}/region`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ region }),
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function fetchDocumentContent(documentId: string): Promise<DocumentContentResult> {
  const res = await authFetch(`${API_BASE}/documents/${encodeURIComponent(documentId)}/content`);
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function testRetrieval(payload: RetrievalTestPayload): Promise<RetrievalTestResult> {
  const res = await authFetch(`${API_BASE}/retrieval/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

// ── Certificate Verification ─────────────────────────────────────────────────

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

  const res = await authFetch(`${UPLOAD_API_BASE}/certificates/verify`, { method: "POST", body: form });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function fetchCertificates(): Promise<SupplierAuditResponse[]> {
  const res = await authFetch(`${API_BASE}/certificates`);
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

// ── Database Browser ─────────────────────────────────────────────────────────

export async function fetchDbTables(): Promise<DbTableMeta[]> {
  const res = await authFetch(`${API_BASE}/db/tables`);
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function fetchDbTable(
  table: string,
  limit: number = 100,
  offset: number = 0,
  search?: string
): Promise<DbTableData> {
  const qParam = search ? `&q=${encodeURIComponent(search)}` : "";
  const res = await authFetch(
    `${API_BASE}/db/tables/${encodeURIComponent(table)}?limit=${limit}&offset=${offset}${qParam}`
  );
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function deleteDbRow(table: string, pk: Record<string, string>): Promise<void> {
  const res = await authFetch(`${API_BASE}/db/tables/${encodeURIComponent(table)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pk }),
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
}

export async function updateDbCell(
  table: string,
  pk: Record<string, string>,
  column: string,
  value: string
): Promise<void> {
  const res = await authFetch(`${API_BASE}/db/tables/${encodeURIComponent(table)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pk, column, value }),
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
}

export async function fetchDbSchema(): Promise<DbSchema> {
  const res = await authFetch(`${API_BASE}/db/schema`);
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function auditAribaSupplier(
  smVendorId: string,
  docId?: string
): Promise<AuditAribaSupplierResult> {
  const url = docId
    ? `${API_BASE}/audit/ariba-supplier?sm_vendor_id=${encodeURIComponent(smVendorId)}&doc_id=${encodeURIComponent(docId)}`
    : `${API_BASE}/audit/ariba-supplier?sm_vendor_id=${encodeURIComponent(smVendorId)}`;
  const res = await authFetch(url, { method: "POST" });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function downloadAribaQuestionnaireAttachments(
  smVendorId: string,
  docId: string
): Promise<DownloadAribaAttachmentsResult> {
  const res = await authFetch(
    `${API_BASE}/ariba/suppliers/${encodeURIComponent(smVendorId)}/questionnaires/${encodeURIComponent(docId)}/download-attachments`,
    { method: "POST" }
  );
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function testIngestDocument(
  file: File,
  mode: "single" | "all" = "single",
  pageNumber: number = 1,
  title?: string
): Promise<TestIngestDocumentResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("mode", mode);
  form.append("page_number", pageNumber.toString());
  if (title) form.append("title", title);

  const res = await authFetch(`${UPLOAD_API_BASE}/documents/test-ingest`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function commitIngestPages(
  filename: string,
  title: string,
  pages: { page_number: number; markdown: string }[]
): Promise<CommitIngestPagesResult> {
  const res = await authFetch(`${API_BASE}/documents/commit-pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, title, pages }),
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function fetchRolesAndFeatures(): Promise<RolesAndFeaturesResponse> {
  try {
    const res = await authFetch(`${API_BASE}/v1/auth/roles`);
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn("Primary endpoint /v1/auth/roles failed, trying fallback:", err);
  }
  const res = await authFetch(`${API_BASE}/auth/roles`);
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

// ── Admin User Management ───────────────────────────────────────────────────

export interface AdminUserItem {
  id: string;
  email: string;
  display_name?: string;
  roles: string[];
  sso_subject?: string | null;
  sso_provider?: string | null;
  is_active: boolean;
  last_login_at?: string | null;
  created_at?: string | null;
  status: string;
}

export interface AdminUsersResponse {
  users: AdminUserItem[];
  available_roles: Array<{ id: string; name: string; display_name: string }>;
}

export async function fetchAdminUsers(): Promise<AdminUsersResponse> {
  const res = await authFetch(`${API_BASE}/admin/users`);
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function createAdminUser(
  email: string,
  roles: string[],
  displayName?: string
): Promise<{ status: string; message: string; user_id?: string }> {
  const res = await authFetch(`${API_BASE}/admin/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, roles, display_name: displayName }),
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function updateAdminUserRoles(
  userId: string,
  roles: string[]
): Promise<{ status: string; message: string }> {
  const res = await authFetch(`${API_BASE}/admin/users/${encodeURIComponent(userId)}/roles`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roles }),
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function deleteAdminUser(userId: string): Promise<{ status: string; message: string }> {
  const res = await authFetch(`${API_BASE}/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export type { ChatSource };
