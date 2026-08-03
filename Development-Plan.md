# Development Plan — CQ Checker

**Source:** `Product Requirement Document (PRD).md`
**Target execution:** July 2026
**Target audience:** ~50 internal employees
**Cost goal:** Combined infra + AI spend **under $8.00/month**

## Stack & Sequencing Decision

| Layer | Now (Phase 0–7) | Last (Phase 8) |
| :--- | :--- | :--- |
| Frontend Hosting | Local Next.js dev server | **GCS static website hosting** |
| Backend API | Local FastAPI (dev) | **GCP Cloud Run** (min-instances=0) |
| Database & Vectors | **Neon PostgreSQL** + pgvector | (unchanged) |
| Object Storage | **Local disk** (dev, via `StorageProvider`) | **GCS Bucket** (`cqa-storage`) |
| Secrets | Local `.env` | **GCP Secret Manager** |
| AI APIs | MiniMax M3, Gemini Embedding 2, DeepSeek V4 Flash, Qwen | (unchanged) |

> **All GCP work is consolidated into the final phase (Phase 8).** GCP project access is not available yet, so Phases 0–7 run against Neon + local disk + local dev servers only. Object storage is abstracted behind a `StorageProvider` interface, and the frontend is a plain Next.js build, so GCS hosting + storage can be swapped in at the end without touching business logic.

---

## Phase 0 — Project Setup & Environment

### Tasks
- [x] Provision a **Neon PostgreSQL** project (region closest to users). Capture the pooled `DATABASE_URL`.
- [x] *Note:* GCP project + GCS bucket + GCS frontend hosting are provisioned in **Phase 8** (no GCP access yet). Until then, object storage uses the backend's local `uploads/` directory and the frontend runs as a local dev server.
- [x] Rewrite `backend/app/config.py`:
  - Add `NEON_DATABASE_URL`
  - Add AI keys: `MINIMAX_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `QWEN_API_KEY`
  - Keep (temporarily) `SUPABASE_URL` / `SUPABASE_KEY` for migration + read-only legacy file serving; mark deprecated
  - Keep existing `UPLOAD_DIR` (local dev storage)
- [x] Add `docker-compose.yml` with local Postgres `pgvector/pgvector:pg16` for offline dev parity
- [x] Create `.env.example` and document all variables in `backend/README.md`
- [x] Update `backend/requirements.txt` (add `asyncpg`, `sqlalchemy[asyncio]`, `alembic`, `google-cloud-storage`, `pgvector`)

### Affected files
- `backend/app/config.py`
- `backend/requirements.txt`
- `backend/.env.example` (new)
- `docker-compose.yml` (new)
- `backend/README.md`

### Exit criteria
- `docker compose up` boots a pgvector database; FastAPI starts locally against Neon.

---

## Phase 1 — Database Foundation (Neon + pgvector)

### Tasks
- [x] Enable extensions: `CREATE EXTENSION IF NOT EXISTS vector;` and `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
- [x] Write migration SQL per PRD §4:
  - `documents` (id, title, file_url, created_at)
  - `parent_chunks` (id, document_id FK, content, page_number)
  - `child_chunks` (id, parent_id FK, content, embedding VECTOR(1536), tsv_content TSVECTOR generated)
  - Indexes: `HNSW (embedding vector_cosine_ops)`, `GIN (tsv_content)`
  - `certificate_verifications` (id, file_url, extracted_data JSONB, status, judge_reasoning, created_at)
  - `query_cache` (id, query_text, query_embedding VECTOR(1536), cached_response, created_at)
- [x] Add legacy tables ported from the current Supabase schema:
  - `suppliers`, `audit_logs` (+ `audit_id` unique column), `document_evidence` (mirror `backend/app/schemas.py` fields)
- [x] Set up **Alembic**: `alembic init`, `env.py` wired to async engine, initial revision
- [x] Build async repository layer:
  - `backend/app/db/session.py` (async engine + session factory)
  - `backend/app/repositories/documents.py`, `chunks.py`, `certificates.py`, `cache.py`, `audit.py`
- [x] Seed fixtures + unit tests (`backend/tests/test_repositories.py`)

### Affected files
- `backend/migrations/` (new, Alembic)
- `backend/app/db/` (new)
- `backend/app/repositories/` (new)
- `backend/app/models/` (new, SQLAlchemy models)
- `backend/tests/test_repositories.py`

### Exit criteria
- Migrations apply cleanly on Neon; CRUD + hybrid-search queries return correct rows; tests green.

---

## Phase 2 — Supabase → Neon Data Migration (guided steps)

### Step 1 — Export from Supabase
- [x] **Data source confirmed:** audit data lives in **Supabase Postgres tables** (`supplier_list`, `document_evidence`, `audit_results`) — not Google Sheets. The legacy `sheets.py` (since deleted in Phase 3) called the Supabase REST API directly.
- [x] **No manual export needed** — the migration script (`migrate_supabase_to_neon.py`) reads these tables directly via the Supabase REST API (same mechanism the current backend uses), paginated at 1000 rows/request
- [ ] *(Optional backup)* In the Supabase Dashboard → SQL Editor, run `select * from <table>` for each of the 3 tables and save the result as CSV as a safety copy

### Step 2 — (Removed) No Google Sheets export
- [x] Google Sheets is **legacy/dead code** — the current backend writes to Supabase REST API only. No Sheets access or export is needed.

### Step 3 — Import into Neon
- [x] `backend/scripts/migrate_supabase_to_neon.py` (**built**) reads Supabase + Neon credentials **from your local `backend/.env`** — the key is never shared
- [x] Run locally: `python -m scripts.migrate_supabase_to_neon --dry-run` to preview, then without `--dry-run` to execute
- [x] Idempotent (skips rows whose unique `audit_id` / hash already exists)
- [x] **Keeps existing Supabase `file_url` values as-is for now** (legacy read-only serving); URLs get re-mapped to GCS in **Phase 8**
- [x] Logs a per-table row count report
- [x] **MIGRATED 2026-07-31:** 32 suppliers, 36 document evidence records, 36 audit logs → verified in Neon

### Step 4 — Storage (deferred to Phase 8)
- [ ] Object files (certificates/manuals) are **not migrated yet** — this happens in Phase 8 when GCS is available
- [ ] Until then, the legacy Supabase storage bucket remains the read-only source for historical file URLs

### Step 5 — Verify
- [x] Row-count comparison (Supabase vs Neon) matches
- [x] Spot-check 10 sample audit records render correctly via existing legacy URLs
- [ ] After verification, remove Supabase credentials from `config.py`

### Affected files
- `backend/scripts/migrate_supabase_to_neon.py` (built)
- `backend/scripts/backups/` (new, gitignored)

### Exit criteria
- All historical audit data reachable in Neon; row counts verified; storage files left in place for Phase 8 GCS migration.

---

## Phase 3 — Backend API Foundation

### Tasks
- [x] Replace `backend/app/services/sheets.py` data access (Supabase REST calls) with the Phase 1 repositories; **`sheets.py` deleted** — replaced by `audit_data.py` (async, Neon-backed)
- [x] Add `backend/app/services/storage.py`: `StorageProvider` interface with a **LocalDisk** implementation (uses existing `UPLOAD_DIR`) — new uploads write to local disk and serve via `/api/files/local/*`. GCS implementation is added in **Phase 8**
- [x] Legacy Supabase file proxy (`proxy_supabase_file` in `main.py`) kept for read-only historical files during the transition
- [x] Keep every existing `/api/*` route contract intact so the Chrome Extension and Next.js frontend keep working (see `frontend/src/lib/api.ts` and `extension/`)
- [x] Update `schemas.py` timestamps/types to be DB-native where safe; keep response shapes unchanged
- [x] Legacy scripts `reaudit_db.py` / `revert_audit.py` migrated from `sheets` to `audit_data`
- [x] Run tests: **103 passing** (8 new `test_audit_data.py`, `test_sheets.py` removed)

### Affected files
- `backend/app/services/storage.py` (new)
- `backend/app/services/audit_data.py` (new)
- `backend/app/services/sheets.py` (deleted)
- `backend/app/main.py`
- `backend/app/schemas.py`
- `backend/reaudit_db.py`, `backend/revert_audit.py` (migrated)
- `backend/tests/test_audit_data.py` (new), `backend/tests/test_sheets.py` (removed)

### Exit criteria
- All existing API endpoints function against Neon + local-disk storage; existing test suite passes (103 tests).

---

## Phase 4 — Certificate Extraction & Verification Pipeline

### Tasks
- [ ] **DeepSeek V4 Flash extractor** (`backend/app/services/extractor.py`):
  - Replace `gemini.extract_certificate_data` call path in `_process_uploaded_files`
  - Multi-modal / JSON-mode prompt returning strict JSON: Name, ID Number, Expiry Date, Issuing Authority, + confidence scores
- [ ] **Qwen Reasoning judge** (`backend/app/services/judge.py`):
  - Input: extracted JSON + company compliance rules (stored in `certificate_verifications` or a new `compliance_rules` table)
  - CoT reasoning trace + status: `PASS` / `FAIL` / `REQUIRES_HUMAN_REVIEW`
- [ ] Update `certificate_verifications` flow to save: extracted JSON, confidence, judge reasoning, status, timestamps
- [ ] Port existing `backend/app/services/auditor.py` comparison rules into the judge config (QA label matching, expiration logic)
- [ ] Add `/api/certificates/verify` and `/api/certificates` (list) endpoints
- [ ] Tests: `backend/tests/test_extractor.py`, `test_judge.py`

### Affected files
- `backend/app/services/extractor.py` (new)
- `backend/app/services/judge.py` (new)
- `backend/app/repositories/certificates.py`
- `backend/app/main.py`
- `backend/app/config.py`

### Exit criteria
- A sample certificate yields valid JSON + a reasoned PASS/FAIL verdict; audit row persisted in Neon.

---

## Phase 5 — Document Ingestion & RAG Pipeline

### Tasks
- [ ] `/api/documents/upload` → upload PDF via `StorageProvider` (local disk for now, GCS in Phase 8), insert `documents` row, return `document_id`
- [ ] **MiniMax M3 parser** (`backend/app/services/parser.py`) → structured Markdown (text, tables, layouts), track `page_number`
- [ ] **Parent–child chunking** (`backend/app/services/chunker.py`):
  - Parent chunk ≈ 800–1,000 tokens (full paragraph/table context)
  - Child chunk ≈ 200 tokens (vectorized)
  - Link children → parent via FK
- [ ] **Gemini Embedding 2** (`backend/app/services/embeddings.py`):
  - `gemini-embedding-2` with Matryoshka output dimension **1536**
- [ ] Batch insert child rows (content + embedding) into `child_chunks`
- [ ] Idempotency: skip re-processing when `documents.file_url` / hash already ingested
- [ ] Tests: `backend/tests/test_ingestion.py` (end-to-end parse → chunk → embed → insert)

### Affected files
- `backend/app/services/parser.py` (new)
- `backend/app/services/chunker.py` (new)
- `backend/app/services/embeddings.py` (new)
- `backend/app/repositories/documents.py`, `chunks.py`
- `backend/app/main.py`

### Exit criteria
- A ~50-page test manual is fully ingested; parent/child rows + embeddings present in Neon; hybrid-search index usable.

---

## Phase 6 — RAG Chatbot Query API

### Tasks
- [ ] `/api/chat` endpoint (`backend/app/services/rag.py`):
  1. **Semantic cache**: embed query, search `query_cache` with cosine similarity > 0.93 → return cached response ($0 LLM cost)
  2. **Hybrid retrieval** (single SQL): combine pgvector `<=>` with tsvector/BM25; retrieve top-3 child vectors (K=3)
  3. **Parent context fetch**: pull the 3 associated parent chunks (~1,000 tokens total)
  4. **Generation**: query + parent context → **DeepSeek V4 Flash**, static system prompt placed at head for prompt caching
  5. Write cache miss response back to `query_cache`
- [ ] Add `/api/chat/history` (optional, simple session storage) and cache-clear admin endpoint
- [ ] Cost instrumentation: log token usage + `cost_usd` per request for analytics
- [ ] Tests: `backend/tests/test_rag.py` (cache hit, cache miss, retrieval quality on seeded manual)

### Affected files
- `backend/app/services/rag.py` (new)
- `backend/app/repositories/cache.py`
- `backend/app/main.py`
- `backend/app/schemas.py`

### Exit criteria
- Repeated query hits cache; new query performs hybrid retrieval and returns a grounded answer; cost per query logged.

---

## Phase 7 — Frontend (Local Dev)

### Tasks
- [ ] Update `frontend/src/lib/api.ts` to point at the local backend (`http://localhost:<port>/api/*`)
- [ ] Add **Next.js rewrites** in `frontend/next.config.ts` so `/api/*` forwards to the local FastAPI backend (mirrors the prod same-origin URL shape; swaps to Cloud Run URL in Phase 8)
- [ ] Add UI screens:
  - **Chatbot UI** (query box, streaming answer, source/citation chips from parent chunks)
  - **Document Ingest UI** (upload manual → show ingestion progress/status)
  - **Certificate Verification UI** (upload cert → show extracted JSON + judge reasoning + status badge)
  - Migrate existing **SupplierAudit / AuditRegistry / CostAnalytics** screens off Supabase URLs (use Neon-backed endpoints)
- [ ] `next build` produces a standard static export (`output: 'export'`) ready for GCS hosting in Phase 8
- [ ] File rendering: backend serves new uploads from local disk via a `/api/files/*` proxy endpoint (moves to GCS in Phase 8); legacy Supabase URLs still served by the existing proxy
- [ ] E2E smoke tests (`frontend/tests/`) for the 3 new screens
- [ ] **Gemini-style Citation Side Panel**: Implement split/resizable view (`react-resizable-panels`) pairing chat on the left with PDF viewer (`react-pdf` / `pdfjs-dist`) on the right. Clicking inline citation badges (`[1]`) jumps the viewer directly to `#page=X` using GCS Signed URLs.

### Affected files
- `frontend/next.config.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/components/Chatbot.tsx` (new)
- `frontend/src/components/DocumentIngest.tsx` (new)
- `frontend/src/components/CertificateVerification.tsx` (new)

### Exit criteria
- All three workflows function end-to-end in a local browser against the Neon backend.

---

## Phase 8 — GCP Migration & Cloud Run Deployment (LAST — requires GCP access)

> ⚠️ All GCP work is blocked until GCP project access is granted. Everything below is deferred; nothing in Phases 0–7 depends on it.

### Tasks
- [ ] **Provision GCP** (first time): create GCP project; enable Cloud Run, Artifact Registry, Secret Manager, IAM, Cloud Storage APIs
- [ ] **Create GCS bucket**: `cqa-storage` — private object storage for raw PDFs and certificate images.
- [ ] **Deploy Frontend to GCS static hosting**:
  - Deploy `frontend/out` (static export from `next build`) to a public `cqa-frontend` bucket via `gsutil rsync`.
  - Configure website index/error pages + DNS.
- [ ] **Storage migration — Supabase → GCS** (`backend/scripts/migrate_storage_to_gcs.py`):
  - List all objects in the Supabase `certificates` bucket, download each, upload to GCS preserving folder names
  - Write a manifest (old URL → new GCS URL)
  - Batch-update `file_url` values in Neon (documents, document_evidence, certificate_verifications) from the manifest
- [ ] Add **GCS `StorageProvider`** implementation (`backend/app/services/storage.py`) — interface identical to local-disk impl; flip the default
- [ ] Replace the local-disk + legacy Supabase file proxies with a GCS-backed serving flow (signed URLs / GCS proxy)
- [ ] Containerize FastAPI:
  - `backend/Dockerfile` (multi-stage, python-slim)
  - Store `NEON_DATABASE_URL` + all AI keys in **Secret Manager**; mount via Cloud Run env
- [ ] Deploy service with `min-instances=0`, region per PRD (`asia-southeast1`)
- [ ] Point the frontend's API base URL from the local dev server → **Cloud Run URL** (`NEXT_PUBLIC_API_URL`), and drop the local Next.js rewrite
- [ ] CI/CD (`.gitlab-ci.yml`): lint → test → build image → push Artifact Registry → `gcloud run deploy` → `gsutil rsync` frontend
- [ ] Load test ~50 concurrent users; verify cold-start behavior and latency

### Affected files
- `backend/Dockerfile` (new)
- `backend/scripts/migrate_storage_to_gcs.py` (new)
- `backend/app/services/storage.py` (add GCS impl)
- `frontend/next.config.ts` (swap rewrite → `NEXT_PUBLIC_API_URL`)
- `.gitlab-ci.yml`
- `cloudbuild.yaml` / `gcloud` deploy script (new)

### Exit criteria
- Deploy from an empty repo (CI) to a live Cloud Run endpoint + GCS-hosted frontend; secrets come from Secret Manager; all historical + new files served from GCS.

---

## Phase 9 — Testing, Cost Validation & Handover

### Tasks
- [ ] **E2E suite** (Playwright, `frontend/tests/`): ingest → chat → cert verify happy paths + error states
- [ ] **API integration tests**: full pipelines (ingestion, RAG, cert) against a Neon branch
- [ ] **Cost validation** vs. `< $8.00/month` target using the Phase 0–8 budget (Neon `$0–2.50`, MiniMax+Embeddings `~$0.65`, Cert `~$0.60`, Chatbot `~$2.50–4.00`, GCS free tier for storage + frontend hosting `$0`)
- [ ] **Security hardening**: Secret Manager only (no `.env` in prod), least-privilege IAM, GCS access controls, input validation, rate limiting on `/api/chat`
- [ ] **Docs**: update `backend/README.md` + `frontend/README.md`; write runbooks (migration, deploy, cost monitoring)
- [ ] Handover checklist + demo script

### Exit criteria
- All tests green; measured spend within budget; deployable/rollback runbook documented.

---

## Appendix A — Dependency Graph

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 ──→ Phase 4 ──→ Phase 9
              │                    └────→ Phase 5 ──→ Phase 6
              └──── Phase 7 (depends on 3, 4, 5, 6) ─┘
Phase 8 runs last (all GCP work: GCS buckets + hosting, Secret Manager, Cloud Run); can run in parallel with Phase 9 hardening.
```

## Appendix B — Key Principles
- **Contract stability:** never break the existing `/api/*` contract used by the extension + frontend.
- **Idempotent migrations:** all migration scripts re-runnable without data duplication.
- **Cost-first:** semantic cache + prompt caching + 1536-dim embeddings + scale-to-zero are non-negotiable.
- **GCP last:** nothing in Phases 0–7 depends on GCP. All GCP work (project creation, GCS buckets + static hosting, Secret Manager, Cloud Run) is isolated in Phase 8 and swapped in behind the `StorageProvider` interface + `NEXT_PUBLIC_API_URL`.
