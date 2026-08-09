# CQ Checker — API Endpoints Reference

Grouped by function. Source: `backend/app/main.py`

---

## 🔍 Summary Table

| # | Method | Path | Group |
|---|---|---|---|
| 1 | `GET` | `/` | System / Health |
| 2 | `POST` | `/api/extract` | Supplier Audit — Extraction |
| 3 | `POST` | `/api/test/extract` | Supplier Audit — Extraction |
| 4 | `POST` | `/api/audit` | Supplier Audit — Full Run |
| 5 | `POST` | `/api/audit/comparison` | Supplier Audit — Comparison |
| 6 | `GET` | `/api/logs` | Supplier Audit — Read |
| 7 | `GET` | `/api/audit-registry` | Supplier Audit — Read |
| 8 | `GET` | `/api/evidence` | Supplier Audit — Read |
| 9 | `PUT` | `/api/evidence` | Supplier Audit — Update |
| 10 | `GET` | `/api/logs/{supplier_id}/assets` | Supplier Audit — Read |
| 11 | `GET` | `/api/costs` | Cost Analytics |
| 12 | `POST` | `/api/certificates/verify` | Certificate Verification |
| 13 | `GET` | `/api/certificates` | Certificate Verification |
| 14 | `POST` | `/api/documents/upload` | Document Ingestion / RAG |
| 15 | `GET` | `/api/documents` | Document Ingestion / RAG |
| 16 | `POST` | `/api/chat` | RAG Chatbot |
| 17 | `GET` | `/api/chat/history` | RAG Chatbot |
| 18 | `POST` | `/api/chat/cache/clear` | RAG Chatbot |
| 19 | `GET` | `/api/files/{encoded_url:path}` | File Serving — Legacy |
| 20 | `GET` | `/api/files/local/{folder}/{filename}` | File Serving — Local |

---

## 🏷️ System / Health

### `GET /`
- **Purpose:** Health check / service identification.
- **Returns:** `{"status": "healthy", "service": "GPO Automatic Certificate Auditor API"}`

---

## 📄 Supplier Audit — Extraction (legacy Gemini flow)

### `POST /api/extract`
- **Purpose:** Phase 1 — Chrome Extension entry point. Single-pass file processing: read → match QA label → hash → upload → Gemini extraction. Saves `document_evidence` rows and returns an `audit_id` for the comparison phase.
- **Form params:** `supplier_name`, `supplier_folder` (optional), `workspace_title`, `cert_type`, `qa_data` (JSON), `files` (multi), `screenshot` (optional).
- **Returns:** `audit_id`, `supplier_name`, `file_count`, `total_extraction_cost_usd`, etc.

### `POST /api/test/extract`
- **Purpose:** Dev/test helper — upload one file and return raw Gemini OCR extraction JSON without persisting anything.
- **Form params:** `file`.
- **Returns:** `extracted_data` + token/cost `usage`.

---

## 📄 Supplier Audit — Full Run & Comparison

### `POST /api/audit`
- **Purpose:** Main audit endpoint (Chrome Extension). Single-pass extraction **+** code-based `auditor.run_full_audit` comparison, then persists `audit_logs` + `document_evidence` to Neon.
- **Form params:** `supplier_name`, `supplier_folder` (optional), `workspace_title`, `cert_type`, `qa_data` (JSON), `files` (multi), `screenshot` (optional).
- **Returns:** full `AuditResultResponse` (result, expiration, comment, costs, `comparison_table`).

### `POST /api/audit/comparison`
- **Purpose:** Phase 2 — run only the comparison half. Loads evidence from DB by `audit_id`, runs the auditor, saves the audit log, returns the verdict.
- **Form params:** `audit_id`, `supplier_name`, `workspace_title`, `cert_type`, `qa_data`, `screenshot_url` (optional), `timestamp`.
- **Returns:** `AuditResultResponse` (includes MYR-cost fields).

---

## 📄 Supplier Audit — Read / Update

### `GET /api/logs`
- **Purpose:** Fetch all historical audit logs.
- **Returns:** `List[AuditLogEntry]`.

### `GET /api/audit-registry`
- **Purpose:** Consolidated registry — supplier info, result, document counts per audit (drives the AuditRegistry screen).
- **Returns:** `List[AuditRegistryEntry]`.

### `GET /api/evidence`
- **Purpose:** Fetch all document-evidence records (extracted file details).
- **Returns:** `List[DocumentEvidence]`.

### `PUT /api/evidence`
- **Purpose:** Update extracted certificate JSON metadata for one evidence record (by `audit_id` + `filename`), recompute the comparison verdict **before** saving, and update the parent audit result.
- **Body:** `UpdateEvidenceRequest` (`audit_id`, `filename`, `updated_metadata`).
- **Returns:** `{"status", "message", "audit_result", "suggested_comment", "comparison_table"}`.
- **Errors:** 404 if audit/record missing; 500 if verdict recompute fails (nothing saved).

### `GET /api/logs/{supplier_id}/assets`
- **Purpose:** Return a supplier's screenshots + documents via stored `file_url`s.
- **Returns:** `{"screenshots": [...], "documents": [...]}`.

---

## 💰 Cost Analytics

### `GET /api/costs`
- **Purpose:** Aggregated cost/usage analytics across audits (feeds the CostAnalytics screen).
- **Returns:** analytics payload from `audit_data.get_cost_analytics()`.

---

## 📜 Certificate Verification (Phase 4 pipeline)

### `POST /api/certificates/verify`
- **Purpose:** Upload cert → Gemini 3.5 Flash Lite extraction → deterministic rules → persist to `certificate_verifications` → return verdict + reasoning. Gemini returns one JSON object per distinct certificate in the file (nested under `extracted_data.certificates[]`); the overall status is worst-wins across certificates.
- **Form params:** `file`, `supplier_name`, `question_label` (optional), `qa_answers` (optional, default `"[]"`), `qa_data_title` (optional).
- **Returns:** `CertificateVerifyResult` (`status`, `extracted_data` with nested `certificates[]`, `reasoning_trace`, `confidence`, `rule_result`, `record_id`).
- **Errors:** 502 if extraction fails.

### `GET /api/certificates`
- **Purpose:** List past verifications with pagination.
- **Query params:** `limit` (default 50), `offset` (default 0).
- **Returns:** `List[SupplierAuditResponse]`.

---

## 📚 Document Ingestion / RAG (Phase 5)

### `POST /api/documents/upload`
- **Purpose:** Upload manual PDF → parse (MiniMax / PyMuPDF fallback) → parent-child chunking → Gemini embeddings → store in Neon. Idempotent via SHA-256 `file_hash`.
- **Form params:** `file`, `title` (optional).
- **Returns:** `DocumentIngestResult` (`document_id`, `parent_count`, `child_count`, `cost_usd`, `status`).
- **Errors:** 502 if ingestion fails.

### `GET /api/documents`
- **Purpose:** List ingested documents with parent/child chunk counts.
- **Query params:** `limit` (default 50), `offset` (default 0).
- **Returns:** `List[DocumentSummary]`.

---

## 💬 RAG Chatbot (Phase 6)

### `POST /api/chat`
- **Purpose:** RAG query. Flow: semantic cache (cosine > 0.93) → hybrid retrieval (pgvector + tsvector) → Gemini generation. Multi-turn aware via `session_id`. Set `stream: true` for an **SSE** streaming answer.
- **Body:** `ChatRequest` (`query`, `session_id?`, `stream?`).
- **Returns:** `ChatResponse` (`answer`, `sources`, `cost_usd`, `cache_hit`, `session_id`) — or SSE event stream when `stream: true`.

### `GET /api/chat/history`
- **Purpose:** Return conversation history for a session.
- **Query params:** `session_id` (required).
- **Returns:** `ChatHistoryResponse` (`session_id`, `messages`).

### `POST /api/chat/cache/clear`
- **Purpose:** Admin — clear the semantic query cache.
- **Returns:** `{"status": "success", "cleared": <count>}`.

---

## 🗂️ File Serving

### `GET /api/files/{encoded_url:path}`
- **Purpose:** **Legacy** — proxy a file from Supabase Storage through the backend (historical records only). Restricts to the configured Supabase `certificates` bucket prefix; 50 MB cap.
- **Path param:** base64url-encoded Supabase object URL.
- **Errors:** 400 (bad encoding), 404 (disallowed URL), 413 (too large), 502 (storage fetch failed).

### `GET /api/files/local/{folder}/{filename}`
- **Purpose:** Serve files uploaded to the local-disk storage provider (dev). Path traversal prevented by resolving inside `UPLOAD_DIR`; 50 MB cap.
- **Path params:** `folder`, `filename` (URL-decoded).
- **Errors:** 404 (not found), 413 (too large).

---

## 🧭 Workflow Map (which endpoints a flow calls)

- **Supplier Audit (Chrome Extension):** `POST /api/audit` (or `/api/extract` → `/api/audit/comparison`) → `GET /api/audit-registry` / `/api/logs` / `/api/evidence` / `/api/costs` / `/api/logs/{id}/assets`.
- **Certificate Verification:** `POST /api/certificates/verify` → `GET /api/certificates`.
- **Document RAG:** `POST /api/documents/upload` → `GET /api/documents` → `POST /api/chat` (+ `GET /api/chat/history`, `POST /api/chat/cache/clear`).
- **File rendering:** `GET /api/files/local/*` (new) or `GET /api/files/{b64}` (legacy Supabase).
