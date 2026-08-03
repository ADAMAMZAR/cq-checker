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
│   ├── regions.py         # Region constants
│   ├── db/
│   │   └── session.py     # Async engine + session factory
│   ├── models/
│   │   └── tables.py      # SQLAlchemy ORM models
│   ├── repositories/
│   │   ├── documents.py   # Document + chunk CRUD
│   │   ├── certificates.py # Certificate verification CRUD
│   │   ├── cache.py       # Semantic query cache
│   │   └── audit.py       # Legacy audit/supplier/evidence CRUD
│   └── services/          # Business logic
│       ├── auditor.py     # Certificate audit rules (legacy /api/audit)
│       ├── gemini.py      # Gemini extraction (legacy /api/audit)
│       ├── audit_data.py  # Neon-backed data access (replaces legacy sheets.py)
│       ├── storage.py     # StorageProvider (LocalDisk now, GCS in Phase 8)
│       ├── pdf.py         # PDF -> image rendering (PyMuPDF)
│       ├── rules.py       # Deterministic certificate rules (reuses auditor.py)
│       ├── extractor.py   # DeepSeek V4 Flash extractor
│       ├── judge.py       # Qwen reasoning judge (with rules fallback)
│       ├── parser.py      # PDF -> Markdown (MiniMax M3 + PyMuPDF fallback)
│       ├── chunker.py     # Parent-child chunking
│       ├── embeddings.py  # Gemini Embedding 2 (REST, 1536-dim)
│       └── ingest.py      # Document ingestion orchestrator
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
