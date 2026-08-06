# CQ Checker — Backend API

FastAPI backend for certificate auditing, document RAG, and AI-powered verification.

## Stack

| Layer | Now | Phase 8 (GCP) |
| :--- | :--- | :--- |
| Database | Neon PostgreSQL + pgvector | (unchanged) |
| Storage | Local `uploads/` dir | GCS bucket |
| Hosting | Local dev server | Cloud Run (min-instances=0) |
| Secrets | `.env` file | GCP Secret Manager |

## Local Development

### Prerequisites

- Python 3.10+
- Docker + Docker Compose (for local pgvector)

### Quick Start

```bash
# 1. Start local pgvector database
docker compose up -d

# 2. Copy and fill env vars
cp .env.example .env
# Edit .env — at minimum set NEON_DATABASE_URL (or use the default localhost URL)

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run the API
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`.

## Environment Variables

| Variable | Purpose | Default |
| :--- | :--- | :--- |
| `NEON_DATABASE_URL` | Neon PostgreSQL connection string (asyncpg) | `postgresql+asyncpg://postgres:postgres@localhost:5432/cq_checker` |
| `GEMINI_API_KEY` | Google Gemini API key | — |
| `MINIMAX_API_KEY` | MiniMax M3 parser API key | — |
| `DEEPSEEK_API_KEY` | DeepSeek V4 Flash API key | — |
| `QWEN_API_KEY` | Qwen Reasoning judge API key | — |
| `DEEPSEEK_BASE_URL` | DeepSeek API base URL | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | DeepSeek model name | `deepseek-v4-flash` |
| `QWEN_BASE_URL` | Qwen (DashScope) OpenAI-compatible base URL | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `QWEN_MODEL` | Qwen model name | `qwen-max` |
| `MINIMAX_BASE_URL` | MiniMax M3 API base URL | `https://api.minimax.chat` |
| `MINIMAX_MODEL` | MiniMax model name | `MiniMax-M3` |
| `GEMINI_EMBEDDING_MODEL` | Gemini embedding model | `gemini-embedding-2` |
| `GEMINI_EMBEDDING_DIM` | Embedding output dimension | `1536` |
| `SUPABASE_URL` | ⚠️ Deprecated — read-only historical files | — |
| `SUPABASE_KEY` | ⚠️ Deprecated — read-only historical files | — |
| `VERTEX_PROJECT` | ⚠️ Deprecated — migration only | — |
| `VERTEX_LOCATION` | ⚠️ Deprecated — migration only | `us-central1` |
| `UPLOAD_DIR` | Local file upload directory (dev) | `uploads` |

## API Endpoints

Grouped by function. Full reference: [`API-Endpoints.md`](../API-Endpoints.md). Interactive docs at `http://localhost:8000/docs` (Swagger).

### Summary

| Method | Path | Group |
|---|---|---|
| `GET` | `/` | System / Health |
| `POST` | `/api/extract` | Supplier Audit — Extraction |
| `POST` | `/api/test/extract` | Supplier Audit — Extraction |
| `POST` | `/api/audit` | Supplier Audit — Full Run |
| `POST` | `/api/audit/comparison` | Supplier Audit — Comparison |
| `GET` | `/api/logs` | Supplier Audit — Read |
| `GET` | `/api/suppliers` | Supplier Audit — Read |
| `GET` | `/api/audit-registry` | Supplier Audit — Read |
| `GET` | `/api/evidence` | Supplier Audit — Read |
| `PUT` | `/api/evidence` | Supplier Audit — Update |
| `GET` | `/api/logs/{supplier_id}/evidence` | Supplier Audit — Read |
| `GET` | `/api/costs` | Cost Analytics |
| `POST` | `/api/certificates/verify` | Certificate Verification |
| `GET` | `/api/certificates` | Certificate Verification |
| `POST` | `/api/documents/upload` | Document Ingestion / RAG |
| `GET` | `/api/documents` | Document Ingestion / RAG |
| `POST` | `/api/chat` | RAG Chatbot |
| `GET` | `/api/chat/history` | RAG Chatbot |
| `POST` | `/api/chat/cache/clear` | RAG Chatbot |
| `GET` | `/api/files/{encoded_url:path}` | File Serving — Legacy |
| `GET` | `/api/files/local/{folder}/{filename}` | File Serving — Local |

### 🏷️ System / Health

- **`GET /`** — Health check. Returns `{"status": "healthy", "service": "..."}`.

### 📄 Supplier Audit — Extraction (legacy Gemini flow)

- **`POST /api/extract`** — Phase 1 (Chrome Extension). Single-pass file processing (read → match QA label → hash → upload → Gemini extraction), saves `document_evidence`, returns `audit_id`. Form: `supplier_name`, `supplier_folder?`, `workspace_title`, `cert_type`, `qa_data` (JSON), `files[]`, `screenshot?`.
- **`POST /api/test/extract`** — Dev helper. Upload one file, return raw Gemini OCR extraction JSON without persisting. Form: `file`.

### 📄 Supplier Audit — Full Run & Comparison

- **`POST /api/audit`** — Main audit (Chrome Extension). Extraction + code-based `auditor.run_full_audit`, persists `audit_logs` + `document_evidence`. Form: same as `/api/extract`. Returns `AuditResultResponse`.
- **`POST /api/audit/comparison`** — Phase 2. Runs comparison only from existing evidence by `audit_id`, saves audit log, returns verdict. Form: `audit_id`, `supplier_name`, `workspace_title`, `cert_type`, `qa_data`, `screenshot_url?`, `timestamp`.

### 📄 Supplier Audit — Read / Update

- **`GET /api/logs`** — All historical audit logs → `List[AuditLogEntry]`.
- **`GET /api/suppliers`** — All registered suppliers → `List[SupplierEntry]`.
- **`GET /api/audit-registry`** — Consolidated registry (supplier, result, document counts) for the AuditRegistry screen.
- **`GET /api/evidence`** — All document-evidence records → `List[DocumentEvidence]`.
- **`PUT /api/evidence`** — Update extracted metadata for one evidence record (by `audit_id` + `filename`), recompute verdict before saving. Body: `UpdateEvidenceRequest`. 404 if not found; 500 if recompute fails (nothing saved).
- **`GET /api/logs/{supplier_id}/evidence`** — Supplier's screenshots + documents via stored `file_url`s.

### 💰 Cost Analytics

- **`GET /api/costs`** — Aggregated cost/usage analytics across audits.

### 📜 Certificate Verification (Phase 4)

- **`POST /api/certificates/verify`** — Upload cert → DeepSeek extraction → Qwen judge → persist to `certificate_verifications` → verdict + reasoning. Form: `file`, `supplier_name`, `question_label?`, `qa_answers?`, `qa_data_title?`. Returns `CertificateVerifyResult`. 502 if extraction fails.
- **`GET /api/certificates`** — List past verifications. Query: `limit` (50), `offset` (0).

### 📚 Document Ingestion / RAG (Phase 5)

- **`POST /api/documents/upload`** — Upload manual PDF → parse → parent-child chunking → embed → store in Neon. Idempotent via SHA-256 `file_hash`. Form: `file`, `title?`. Returns `DocumentIngestResult`. 502 if ingestion fails.
- **`GET /api/documents`** — List ingested documents with parent/child counts. Query: `limit` (50), `offset` (0).

### 💬 RAG Chatbot (Phase 6)

- **`POST /api/chat`** — RAG query: semantic cache (cosine > 0.93) → hybrid retrieval (pgvector + tsvector) → DeepSeek. Multi-turn via `session_id`. `stream: true` returns SSE. Body: `ChatRequest`.
- **`GET /api/chat/history`** — Conversation history for a session. Query: `session_id`.
- **`POST /api/chat/cache/clear`** — Admin: clear semantic cache. Returns `{"cleared": N}`.

### 🗂️ File Serving

- **`GET /api/files/{encoded_url:path}`** — **Legacy**: proxy a Supabase Storage file (historical records only, restricted to configured bucket, 50 MB cap).
- **`GET /api/files/local/{folder}/{filename}`** — Serve local-disk uploads (dev). Path traversal blocked; 50 MB cap.

### 🧭 Workflow Map

- **Supplier Audit (Chrome Extension):** `POST /api/audit` (or `/api/extract` → `/api/audit/comparison`) → read via `/api/audit-registry` / `/api/logs` / `/api/evidence` / `/api/costs` / `/api/logs/{id}/assets`.
- **Certificate Verification:** `POST /api/certificates/verify` → `GET /api/certificates`.
- **Document RAG:** `POST /api/documents/upload` → `GET /api/documents` → `POST /api/chat` (+ `/api/chat/history`, `/api/chat/cache/clear`).
- **File rendering:** `GET /api/files/local/*` (new) or `GET /api/files/{b64}` (legacy).

## Running Tests

```bash
# All tests
python -m pytest

# With verbose output
python -m pytest -v

# Single test file
python -m pytest tests/test_config.py -v

# Repository/DB tests (requires a running PostgreSQL with pgvector)
#   Option A — local Docker (recommended):
#     docker compose up -d
#     docker exec cq-checker-db psql -U postgres -c "CREATE DATABASE cq_checker_test;"
#   Option B — Neon branch:
#     export TEST_DATABASE_URL="postgresql+asyncpg://<your-neon-url>"
python -m pytest tests/test_repositories.py -v
```

> **Note:** The repository tests create and drop all tables in the database pointed to by `TEST_DATABASE_URL` (default: `cq_checker_test`). Use a dedicated test database — never point it at production data.

## CI/CD

Tests run automatically on every push via `.gitlab-ci.yml`:

- **test_backend**: installs deps, runs `pytest`
- **test_extension**: Playwright E2E for Chrome extension
- **test_frontend**: Next.js build verification

## Project Structure

```
backend/
├── app/
│   ├── config.py          # Settings (env vars)
│   ├── main.py            # FastAPI app + routes
│   ├── schemas.py         # Pydantic models
│   ├── region_configs.py   # Region enum + compliance configs (PL min, validity cap, CIDB)
│   ├── db/
│   │   └── session.py     # Async engine + session factory
│   ├── models/
│   │   └── tables.py      # SQLAlchemy ORM models
│   ├── repositories/
│   │   ├── documents.py   # Document + chunk CRUD
│   │   ├── certificates.py # Certificate verification CRUD
│   │   ├── cache.py       # Semantic query cache
│   │   ├── retrieval.py   # Hybrid vector + full-text retrieval
│   │   ├── chat.py        # Chat session + message CRUD
│   │   ├── object_storage.py # Object-storage metadata CRUD
│   │   └── supplier_audit.py # Legacy audit/supplier/evidence CRUD
│   └── services/          # Business logic
│       ├── auditor.py     # Certificate audit rules (legacy /api/audit)
│       ├── legacy_gemini_audit.py # Legacy Gemini extraction (legacy /api/audit)
│       ├── audit_data_access.py  # Neon-backed data access (replaces legacy sheets.py)
│       ├── database_inspector.py # Read-only DB browser for preview page
│       ├── storage.py     # StorageProvider (LocalDisk now, GCS in Phase 8)
│       ├── pdf.py         # PDF -> image rendering (PyMuPDF)
│       ├── rules.py       # Deterministic certificate rules (reuses auditor.py)
│       ├── extractor.py   # DeepSeek V4 Flash extractor
│       ├── judge.py       # Qwen reasoning judge (with rules fallback)
│       ├── parser.py      # PDF -> Markdown (MiniMax M3 + PyMuPDF fallback)
│       ├── chunker.py     # Parent-child chunking
│       ├── embeddings.py  # Gemini Embedding 2 (REST, 1536-dim)
│       ├── ingest.py      # Document ingestion orchestrator
│       └── rag.py         # RAG chatbot (cache + hybrid retrieval + DeepSeek)
├── migrations/            # Alembic database migrations
│   ├── env.py
│   └── versions/
├── tests/                 # pytest test suite
├── uploads/               # Local file storage (dev)
├── .env.example           # Env var template
├── requirements.txt       # Python dependencies
├── alembic.ini            # Alembic config
├── pytest.ini             # Pytest config (asyncio_mode = auto)
└── README.md              # This file
```

## Database Migrations (Alembic)

```bash
# Generate a new migration (after changing models)
alembic revision --autogenerate -m "description"

# Apply all migrations
alembic upgrade head

# Roll back one migration
alembic downgrade -1
```

Migrations use `NEON_DATABASE_URL` from your `.env` file. For local dev, the default is `postgresql+asyncpg://postgres:postgres@localhost:5432/cq_checker`.
