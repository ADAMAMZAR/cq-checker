# CQ Checker — Complete System ERD & Reference

**Source of truth:** `backend/app/models/tables.py` + Alembic migrations
(`d24c6dbb2fb0` initial schema → `a1b2c3d4e5f6` file_hash → `b2c3d4e5f6a7` chat tables)
**Database:** Neon PostgreSQL 16 + `pgvector` + `pg_trgm`
**System:** Multi-Model AI Engine — Document RAG, Certificate Verification, RAG Chatbot, legacy Supplier Audit

---

## 1. High-Level Overview

The schema holds **9 tables** across **4 domains**:

| Domain | Tables | Purpose |
|---|---|---|
| **Document RAG / Ingestion** | `documents`, `parent_chunks`, `child_chunks` | Store uploaded manuals as hierarchical parent/child chunks for hybrid vector + full-text retrieval |
| **Certificate Verification** | `certificate_verifications` | Persist AI-extracted fields, judge verdict, and reasoning trace |
| **Chatbot** | `chat_sessions`, `chat_messages`, `chat_logs`, `query_cache` | Multi-turn conversations, semantic caching, and per-request cost telemetry |
| **Legacy Audit** | `suppliers`, `audit_logs`, `document_evidence` | Ported from Supabase/Sheets; historical Gemini-based supplier audits |

---

## 2. Entity Relationship Diagram

```mermaid
erDiagram
    DOCUMENTS ||--o{ PARENT_CHUNKS : "document_id (FK, CASCADE)"
    PARENT_CHUNKS ||--o{ CHILD_CHUNKS : "parent_id (FK, CASCADE)"
    SUPPLIERS ||--o{ AUDIT_LOGS : "supplier_id (FK)"
    SUPPLIERS ||--o{ DOCUMENT_EVIDENCE : "supplier_id (FK)"
    AUDIT_LOGS ||--o{ DOCUMENT_EVIDENCE : "audit_id (FK, CASCADE)"
    CHAT_SESSIONS ||--o{ CHAT_MESSAGES : "session_id (FK, CASCADE)"
    USERS ||--o{ CHAT_SESSIONS : "user_id (FK, SET NULL)"

    DOCUMENTS {
        uuid id PK "gen_random_uuid()"
        varchar(255) title "NOT NULL"
        text file_url "NOT NULL"
        varchar(64) file_hash "UNIQUE, idx — SHA-256 dedup"
        timestamptz created_at "server_default now()"
    }
    PARENT_CHUNKS {
        uuid id PK "gen_random_uuid()"
        uuid document_id FK "documents.id, ON DELETE CASCADE"
        text content "NOT NULL — ~800-1000 tokens"
        int page_number "nullable"
    }
    CHILD_CHUNKS {
        uuid id PK "gen_random_uuid()"
        uuid parent_id FK "parent_chunks.id, ON DELETE CASCADE"
        text content "NOT NULL — ~200 tokens"
        vector(1536) embedding "nullable — HNSW indexed"
        tsvector tsv_content "GENERATED from to_tsvector('english', content)"
    }
    CERTIFICATE_VERIFICATIONS {
        uuid id PK "gen_random_uuid()"
        text file_url "NOT NULL"
        varchar(64) file_hash "UNIQUE, idx — SHA-256 dedup"
        jsonb extracted_data "NOT NULL — Name/ID/Expiry/Authority + confidence"
        varchar(50) status "CHECK: PASS | FAIL | REQUIRES_HUMAN_REVIEW"
        text judge_reasoning "Qwen CoT trace"
        timestamptz created_at "server_default now()"
    }
    QUERY_CACHE {
        uuid id PK "gen_random_uuid()"
        text query_text "NOT NULL"
        vector(1536) query_embedding "nullable"
        text cached_response "NOT NULL"
        int hit_count "default 0 — incremented per hit"
        timestamptz last_hit_at "nullable — LRU support"
        timestamptz created_at "idx — TTL eviction"
    }
    USERS {
        uuid id PK "gen_random_uuid()"
        varchar(255) email "UNIQUE, idx — NOT NULL"
        varchar(255) display_name "nullable"
        varchar(50) role "default 'employee'"
        timestamptz created_at "server_default now()"
    }
    CHAT_SESSIONS {
        uuid id PK "gen_random_uuid()"
        varchar(100) session_id "UNIQUE, idx — client-supplied"
        uuid user_id FK "users.id, ON DELETE SET NULL"
        timestamptz created_at "server_default now()"
    }
    CHAT_MESSAGES {
        uuid id PK "gen_random_uuid()"
        varchar(100) session_id "FK — chat_sessions.session_id, ON DELETE CASCADE"
        varchar(20) role "CHECK: user | assistant"
        text content "NOT NULL"
        timestamptz created_at "server_default now()"
    }
    CHAT_LOGS {
        uuid id PK "gen_random_uuid()"
        text query_text "NOT NULL"
        int input_tokens "default 0"
        int output_tokens "default 0"
        numeric(12,6) cost_usd "default 0 — fractional USD preserved"
        int cache_hit "0/1"
        int latency_ms "default 0"
        timestamptz created_at "server_default now()"
    }
    OBJECT_STORAGE {
        uuid id PK "gen_random_uuid()"
        text file_url "UNIQUE, idx — NOT NULL"
        varchar(255) bucket "nullable — e.g. 'cqa-storage' (GCS)"
        text object_key "nullable — object path/URL"
        varchar(100) content_type "nullable"
        int size_bytes "nullable"
        varchar(64) checksum "nullable — SHA-256"
        timestamptz created_at "server_default now()"
    }
    SUPPLIERS {
        int id PK "autoincrement"
        varchar(255) supplier_name "UNIQUE, NOT NULL"
        timestamptz date_added "server_default now()"
    }
    AUDIT_LOGS {
        uuid id PK "gen_random_uuid()"
        varchar(100) audit_id "UNIQUE, idx"
        int supplier_id FK "suppliers.id, NOT NULL"
        timestamptz timestamp "NOT NULL — real date (was VARCHAR)"
        varchar(255) supplier_name "NOT NULL — denormalized copy"
        varchar(255) workspace_title "default 'Ariba Workspace'"
        varchar(100) cert_type "default 'Relational evidence'"
        text complete_qa_data_dump "default '[]'"
        text compiled_extracted_data "NOT NULL"
        varchar(50) result "CHECK: Match | Mismatch"
        varchar(50) expiration_date "default 'N/A'"
        text suggested_comment "NOT NULL"
        text screenshot_url "nullable"
        int comparison_input_tokens "default 0"
        int comparison_output_tokens "default 0"
        numeric(12,6) comparison_cost_usd "default 0 — fractional USD preserved"
        numeric(12,6) total_run_cost_usd "default 0 — fractional USD preserved"
        jsonb comparison_table "nullable"
        timestamptz created_at "server_default now()"
    }
    DOCUMENT_EVIDENCE {
        uuid id PK "gen_random_uuid()"
        varchar(100) audit_id "FK — audit_logs.audit_id, ON DELETE CASCADE"
        int supplier_id FK "suppliers.id, NOT NULL"
        timestamptz timestamp "NOT NULL — real date (was VARCHAR)"
        varchar(255) supplier_name "NOT NULL — denormalized copy"
        varchar(500) filename "NOT NULL"
        varchar(500) ariba_question_label "NOT NULL"
        text ariba_qa_answers "NOT NULL"
        text gemini_extracted_supplier_name "NOT NULL"
        text gemini_extracted_metadata "NOT NULL"
        varchar(100) file_content_type "NOT NULL"
        int input_tokens "default 0"
        int output_tokens "default 0"
        numeric(12,6) cost_usd "default 0 — fractional USD preserved"
        varchar(64) file_hash "nullable"
        text file_url "nullable"
    }
```

### Logical relationships summary

| Relationship | Cardinality | Key | Referential integrity |
|---|---|---|---|
| `documents` → `parent_chunks` | 1 : N | `parent_chunks.document_id` | ✅ Real FK, ON DELETE CASCADE |
| `parent_chunks` → `child_chunks` | 1 : N | `child_chunks.parent_id` | ✅ Real FK, ON DELETE CASCADE |
| `suppliers` → `audit_logs` | 1 : N | `audit_logs.supplier_id` | ✅ Real FK |
| `suppliers` → `document_evidence` | 1 : N | `document_evidence.supplier_id` | ✅ Real FK |
| `audit_logs` → `document_evidence` | 1 : N | `document_evidence.audit_id` | ✅ Real FK (`fk_document_evidence_audit_id`, ON DELETE CASCADE) — fixed in migration `c3d4e5f6a7b8` |
| `chat_sessions` → `chat_messages` | 1 : N | `chat_messages.session_id` | ✅ Real FK (`fk_chat_messages_session_id`, ON DELETE CASCADE) — fixed in migration `c3d4e5f6a7b8` |
| `users` → `chat_sessions` | 1 : N | `chat_sessions.user_id` | ✅ Real FK (`fk_chat_sessions_user_id`, ON DELETE SET NULL) — added in migration `c3d4e5f6a7b8` |
| `certificate_verifications` | — (standalone) | — | — |
| `query_cache` | — (standalone) | — | — |
| `chat_logs` | — (standalone) | — | — |

---

## 3. Indexes

| Table | Index | Type | Purpose |
|---|---|---|---|
| `child_chunks` | `child_chunks_embedding_idx` | HNSW `(embedding vector_cosine_ops)` | pgvector cosine similarity search |
| `child_chunks` | `child_chunks_tsv_content_idx` | GIN `(tsv_content)` | PostgreSQL full-text search (BM25/`ts_rank_cd`) |
| `child_chunks` | `ix_child_chunks_parent_id` | B-tree | FK lookup + cascade |
| `parent_chunks` | `ix_parent_chunks_document_id` | B-tree | FK lookup + cascade |
| `documents` | `ix_documents_file_hash` | B-tree **UNIQUE** | Idempotent ingestion dedup |
| `chat_sessions` | `ix_chat_sessions_session_id` | B-tree **UNIQUE** | Session lookup |
| `chat_messages` | `ix_chat_messages_session_id` | B-tree | Per-session history fetch |
| `query_cache` | `ix_query_cache_created_at` | B-tree | TTL eviction (added `d4e5f6a7b8c9`) |
| `certificate_verifications` | `ix_certificate_verifications_file_hash` | B-tree **UNIQUE** | SHA-256 dedup (added `d4e5f6a7b8c9`) |
| `object_storage` | `ix_object_storage_file_url` | B-tree **UNIQUE** | URL → object metadata lookup (added `e5f6a7b8c9d0`) |
| `audit_logs` | `ix_audit_logs_audit_id` | B-tree **UNIQUE** (`uq_audit_logs_audit_id`) | Migration dedup |
| `document_evidence` | `ix_document_evidence_audit_id` | B-tree | Evidence-by-audit lookup |
| `suppliers` | implicit unique on `supplier_name` | UNIQUE | get-or-create lookup |

---

## 4. Table-by-Table: Where Used & Why Needed

### 4.1 Document RAG / Ingestion

**`documents`**
- **Where used:** `POST /api/documents/upload`, `GET /api/documents`, ingest orchestrator (`backend/app/services/ingest.py`).
- **Why needed:** Registry of ingested manuals (~20 multi-page PDFs). `file_url` points at object storage (local disk now, GCS in Phase 8); `file_hash` (SHA-256, unique) makes re-uploading the same file a no-op instead of duplicating vectors and burning AI spend.

**`parent_chunks`**
- **Where used:** RAG retrieval step 3 — after top-K child vectors match, their parent chunks are pulled as ~1,000-token context for the LLM.
- **Why needed:** Preserves paragraph/table integrity that 200-token child chunks would break; carries `page_number` so citations can jump the PDF viewer to the right page.

**`child_chunks`**
- **Where used:** RAG retrieval step 2 — the single hybrid SQL query (pgvector `<=>` + tsvector/`ts_rank_cd`), top-K = 3.
- **Why needed:** Vectorized search precision (1536-d Gemini embeddings) plus full-text BM25 as a hybrid fallback; `tsv_content` is a generated column so no app-side indexing.

### 4.2 Certificate Verification

**`certificate_verifications`**
- **Where used:** `POST /api/certificates/verify`, `GET /api/certificates`.
- **Why needed:** Audit trail of the ~200 certs/month pipeline — extracted JSON fields, DeepSeek extractor confidence, Qwen judge verdict (`PASS`/`FAIL`/`REQUIRES_HUMAN_REVIEW`), and the CoT reasoning trace. `file_hash` (unique) makes re-uploading the same file return the prior verdict with **zero LLM cost**; `status` is CHECK-constrained.

### 4.3 RAG Chatbot

**`users`**
- **Where used:** New in migration `c3d4e5f6a7b8`; no auth endpoints yet.
- **Why needed:** Attribution for the ~50 internal employees. `chat_sessions.user_id` (nullable, ON DELETE SET NULL) links sessions to users so per-user cost/quota/ownership can be added later.

**`query_cache`**
- **Where used:** `/api/chat` fast path — embed query, search cosine similarity > 0.93; on hit, return cached response for **$0 LLM cost**.
- **Why needed:** Core cost-control lever; ~15,000 queries/month with heavy repetition across 50 employees. Now bounded by TTL (default 30d, `QUERY_CACHE_TTL_DAYS`), lazy-evicted, and counts hits (`hit_count`/`last_hit_at`) for effectiveness reporting.

**`chat_sessions`**
- **Where used:** `/api/chat/history`; session identity supplied by the frontend (`localStorage`).
- **Why needed:** Scopes multi-turn conversations so different users/topics don't bleed context into each other.

**`chat_messages`**
- **Where used:** `/api/chat` multi-turn — last ~6 messages are injected into the prompt; `/api/chat/history` restore.
- **Why needed:** Conversation memory across turns within a session.

**`chat_logs`**
- **Where used:** `/api/chat` telemetry; CostAnalytics frontend screen.
- **Why needed:** Per-request cost observability (tokens, `cost_usd`, `cache_hit`, `latency_ms`) to validate the < $8/month budget target.

### 4.4 Legacy Supplier Audit (ported from Supabase)

**`object_storage`**
- **Where used:** Written by `storage.store_and_record` on every file upload (documents, certificates, evidence, screenshots).
- **Why needed:** File-metadata registry (URL, bucket, object key, content type, size, SHA-256). Phase 8 maps old URLs → GCS objects via this table; enables storage audit + dedup.

**`suppliers`**
- **Where used:** Supplier get-or-create on audit writes; `/api/suppliers` list.
- **Why needed:** Canonical supplier catalog; `supplier_name` unique so every audit maps to one supplier record.

**`audit_logs`**
- **Where used:** `/api/audit` registry (AuditRegistry screen), legacy Gemini comparison flow.
- **Why needed:** One row per audit run — the result verdict (`Match`/`Mismatch`, CHECK-constrained), expiration date, suggested comment, screenshot URL, token/cost accounting, and the structured `comparison_table` for the registry view. `timestamp` is now a real `timestamptz` (legacy strings migrated); sorting/filtering by date now works.

**`document_evidence`**
- **Where used:** SupplierDataEditor screen; per-audit evidence listing (`get_by_audit_id`).
- **Why needed:** Per-document extracted metadata within an audit (filename, Ariba question label/answers, Gemini-extracted fields, MIME, tokens/cost, `file_url`). `timestamp` is now a real `timestamptz`.

---

## 5. Endpoint → Table Matrix

| Endpoint | Tables read/written |
|---|---|
| `POST /api/documents/upload` | `documents` (w), `parent_chunks` (w), `child_chunks` (w) |
| `GET /api/documents` | `documents` (+ aggregate counts of parent/child) |
| `POST /api/chat` | `query_cache` (r/w), `chat_messages` (w), `chat_logs` (w), reads `child_chunks`/`parent_chunks`/`documents` |
| `GET /api/chat/history` | `chat_sessions`, `chat_messages` |
| `GET /api/chat/cache/clear` | `query_cache` (delete) |
| `POST /api/certificates/verify` | `certificate_verifications` (w) |
| `GET /api/certificates` | `certificate_verifications` (r) |
| `/api/audit*` (legacy) | `suppliers`, `audit_logs`, `document_evidence` |

---

## 6. Verdict — What's Missing / Weaknesses

### 6.1 Referential integrity gaps (real bugs)
- ✅ **FIXED (`c3d4e5f6a7b8`)** — `chat_messages.session_id` → `chat_sessions.session_id` real FK (ON DELETE CASCADE). `ChatMessageRepository.add` now ensures the session exists first.
- ✅ **FIXED (`c3d4e5f6a7b8`)** — `document_evidence.audit_id` → `audit_logs.audit_id` real FK (ON DELETE CASCADE). `log_audit_run` now creates/upserts the audit log *before* evidence (placeholder for Phase-1 extract flow).
- ✅ **FIXED (`c3d4e5f6a7b8`)** — `users` table added; `chat_sessions.user_id` → `users.id` (ON DELETE SET NULL). No auth endpoints yet; attribution column is nullable.
- ⚠️ **Remaining** — `chat_logs` still has no link to a session/message/user → cost telemetry can't be traced to a conversation.

### 6.2 Schema / type problems
- ✅ **FIXED (`c3d4e5f6a7b8`)** — `cost_usd`/`comparison_cost_usd`/`total_run_cost_usd` are now `NUMERIC(12,6)` in DB + models; `int()` truncation removed from `ChatLogRepository`, `audit_data.log_audit_run`, and the Supabase migration script.
- ✅ **FIXED (`d4e5f6a7b8c9`)** — CHECK constraints added: `certificate_verifications.status`, `audit_logs.result`, `chat_messages.role`.
- ✅ **FIXED (`d4e5f6a7b8c9`)** — `timestamp` on `audit_logs` / `document_evidence` is now `timestamptz`; legacy strings (ISO + `dd/mm/YYYY, HH:MM:SS`) migrated; read/write convert via `audit_data._to_db_timestamp` / `_display_timestamp` (UTC+8 wall-clock preserved). API still returns `dd/mm/YYYY, HH:MM:SS` strings — zero frontend change.
- ⚠️ **Remaining** — `certificate_verifications.file_hash` dedup **added**; but no dedup on audit evidence rows and `chat_logs` still unlinked.

### 6.3 Missing entities
- ✅ **FIXED (`e5f6a7b8c9d0`)** — `object_storage` metadata table added (file_url, bucket, object_key, content_type, size_bytes, sha256 checksum). `storage.store_and_record` writes it on every upload; Phase 8 GCS migration can map old URLs → GCS objects.
- **No `compliance_rules` / rule-registry table** — Qwen judge rules are hardcoded in `rules.py`; they cannot be versioned, admin-edited, or audited over time.
- **`certificate_verifications` has no FK** to `suppliers` or `documents` → a verification can't be associated with a supplier or a source manual.
- **No `documents` ↔ `document_evidence` link** — the RAG corpus and the legacy audit evidence are disconnected silos of the same concept (supplier certificates).
- **No rate-limit / API-key / quota table** — `/api/chat` is unthrottled, contradicting the Phase 9 security hardening plan.

### 6.4 Operational gaps
- ✅ **FIXED (`d4e5f6a7b8c9`)** — `query_cache` now has TTL (default 30d, `QUERY_CACHE_TTL_DAYS`), lazy eviction on read/write, `hit_count` + `last_hit_at` for effectiveness/LRU.
- ⚠️ **Remaining** — `chat_logs` grows unbounded with no retention policy.
- ⚠️ **Remaining** — No `updated_at` / soft-delete anywhere.
- ⚠️ **Remaining** — `chat_sessions` has no title / last-activity → the history UI restore is fragile and sessions can't be cleaned up.

### 6.5 Recommended fix priority
1. ✅ **DONE** — `users` table + real FKs on `chat_messages.session_id` / `document_evidence.audit_id` (migration `c3d4e5f6a7b8`).
2. ✅ **DONE** — `cost_usd` → `NUMERIC(12,6)` everywhere (DB + model + repos).
3. **`compliance_rules` table** to externalize judge logic.
4. ✅ **DONE** — `query_cache` TTL + eviction + hit counter (migration `d4e5f6a7b8c9`).
5. ✅ **DONE** — `object_storage` metadata table for the Phase 8 GCS migration (migration `e5f6a7b8c9d0`).
6. ✅ **DONE** — Check constraints + `file_hash` dedup on certificate verifications (migration `d4e5f6a7b8c9`).
7. ✅ **DONE** — Legacy `timestamp` → real `timestamptz` (migration `d4e5f6a7b8c9`).

---

*Generated from the live codebase — keep this file in sync whenever `backend/app/models/tables.py` or a new Alembic migration changes the schema.*
