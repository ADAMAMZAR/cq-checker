# Ariba New-Flow Phasing — Implementation Plan

> **Status:** Implementation start, 2026-08-05.
> **Source plan:** `new-flow.md` in this same folder.
> **Approach:** 8 phases, each independently shippable + testable. I implement + self-test each phase; you verify on your side before I start the next one.

---

## How to read this

Each phase has:

- **Goal** — one sentence.
- **Files touched** — exactly what changes; no surprises.
- **What I will do** — concrete steps.
- **How I will test** — commands / assertions that prove it works.
- **How you test** — same commands but on your machine, plus manual checks.
- **Stop / merge signal** — explicit "ready for next phase" criteria.
- **Rollback** — what to revert if a phase goes wrong.

Phases 0–2 are **additive** (no existing behaviour changes). Phases 3–5 are **parallelizable within a phase** but each must complete before the next. Phase 6 is cleanup. Phase 7 is docs.

---

## Phase 0 — Foundation (additive, ~1 hour)

**Goal:** add the new DB columns + Docling dependency, no behaviour change.

**Files touched:**

| File | Change |
|---|---|
| `backend/requirements.txt` | Add `docling==2.15.0` (latest stable at time of writing) + `python-docx` and `openpyxl` (Docling's optional deps for DOCX/XLSX). |
| `backend/migrations/versions/<rev>_ariba_pipeline_columns.py` | New Alembic migration: adds the 14 new `document_evidence` columns + 4 new `audit_logs` columns + the `uq_document_evidence_audit_filename` unique constraint. **All columns nullable / default-nullable** so the migration is purely additive and zero-downtime. |

**What I will do:**

1. Pin Docling + optional deps in `requirements.txt`.
2. Write a forward+backward Alembic migration following the existing pattern (`d4e5f6a7b8c9` is the latest; new revision is `f6a7b8c9d0e1`).
3. Run `alembic upgrade head` against the configured Neon database.
4. Verify with `\d document_evidence` and `\d audit_logs` in psql (or `\d+` for the columns).

**How I will test:**

- `alembic upgrade head` → no errors.
- `alembic downgrade -1` → clean rollback.
- `alembic upgrade head` again → idempotent.
- Inspect schema (raw SQL): all new columns present, all nullable, unique constraint `uq_document_evidence_audit_filename` on `(audit_id, filename)` exists.
- Sanity: the existing `/api/logs` and `/api/evidence` endpoints still return rows (legacy `gemini_extracted_metadata` column untouched).

**How you test:**

```bash
cd backend
alembic upgrade head
psql "$NEON_DATABASE_URL" -c "\d document_evidence"   # expect new columns at the bottom
psql "$NEON_DATABASE_URL" -c "\d audit_logs"          # expect new columns at the bottom
psql "$NEON_DATABASE_URL" -c "\d+ document_evidence"   # expect uq_document_evidence_audit_filename
alembic downgrade -1    # should run cleanly
alembic upgrade head     # should re-apply
```

**Stop signal:** the migration runs forward, backward, and forward again, with no errors. Existing endpoints still serve traffic.

**Rollback:** `alembic downgrade -1` drops the new columns and the unique constraint. Safe because no new code is writing to them yet.

---

## Phase 1 — Docling parser service (new module, ~1 day)

**Goal:** add `backend/app/services/docling_parser.py` + lifespan warm-up. Nothing in the app calls it yet; you can hit a test endpoint or run a CLI script to verify.

**Files touched:**

| File | Change |
|---|---|
| `backend/app/services/docling_parser.py` | **NEW.** The full `parse_to_markdown` wrapper from `new-flow.md` §2.0. |
| `backend/app/main.py` | Add FastAPI lifespan handler that warms Docling at startup. |
| `backend/app/services/storage.py` (optional) | No change, but if Docling needs a tmp dir for large PDFs, add one here. |
| `backend/tests/test_docling_parser.py` | **NEW.** Unit tests with 4–5 sample files (native PDF, scanned PDF, image, DOCX, XLSX). |
| `backend/scripts/dev_parse_sample.py` | **NEW.** CLI script — `python -m scripts.dev_parse_sample <file>` → prints the markdown to stdout. This is the user-facing smoke test. |

**What I will do:**

1. Create `docling_parser.py` (lazy `_get_converter()`, parse_to_markdown with per-page export).
2. Wire the lifespan handler in `main.py` so `await _get_converter()` is called once at app boot (returns synchronously since the model load is CPU-bound, so we wrap in `asyncio.to_thread`).
3. Add a `/api/health/docling` GET that returns `{"loaded": bool, "page_count_warmup": int}` — a cheap test endpoint.
4. Write the unit tests + CLI script.
5. Run them; capture sample output for you.

**How I will test:**

- `python -m scripts.dev_parse_sample backend/tests/fixtures/sample_native.pdf` → prints structured markdown with `<!-- PAGE 1 -->` markers.
- `python -m scripts.dev_parse_sample backend/tests/fixtures/sample_scanned.pdf` → prints OCR'd markdown (may be slower, ~5–30 s first call).
- `pytest backend/tests/test_docling_parser.py -v` → all green.
- `curl http://localhost:8000/api/health/docling` → `{"loaded": true, ...}`.
- Inspect `logs/backend.log` to confirm the model loaded once at startup, not per-request.

**How you test:**

```bash
cd backend
pip install -r requirements.txt
python -m scripts.dev_parse_sample path/to/any.pdf
pytest tests/test_docling_parser.py -v
uvicorn app.main:app --reload
curl http://localhost:8000/api/health/docling
```

**Stop signal:** the CLI script returns well-formatted markdown for at least one native-text PDF and one scanned PDF. Startup takes <2 s longer than before (model load). `/api/health/docling` returns `loaded: true`.

**Rollback:** delete `docling_parser.py`, revert the lifespan change in `main.py`, drop the test files. The migration from Phase 0 is independent and stays.

---

## Phase 2 — DeepSeek text-mode + Qwen correction (new functions, ~1.5 days)

**Goal:** add `extractor.extract_from_text` + split `judge.py` so Qwen does only inline correction. No route uses them yet.

**Files touched:**

| File | Change |
|---|---|
| `backend/app/services/extractor.py` | Add `extract_from_text(pages, question_label)` — text-mode DeepSeek call. Keep the existing `extract_certificate_data` (vision mode) for backwards compat and for the per-file vision fallback. |
| `backend/app/services/judge.py` | Split into two functions: `correct_against_source(...)` (new) and the existing internal `_derive_status_from_rules(rule)` (kept). Old `judge_certificate` becomes a thin wrapper that calls `correct_against_source` then `_derive_status_from_rules` so `/api/certificates/verify` is unaffected. |
| `backend/app/schemas.py` | Add `ProcessedFile` Pydantic model. |
| `backend/tests/test_extractor_text.py` | **NEW.** Mocked DeepSeek HTTP, verify the text-mode payload. |
| `backend/tests/test_judge_correction.py` | **NEW.** Mocked Qwen HTTP, verify inline correction. |
| `backend/scripts/dev_judge_sample.py` | **NEW.** CLI: takes a markdown file + a DeepSeek JSON file → calls Qwen with the right prompt → prints the corrected JSON. |

**What I will do:**

1. `extract_from_text`: builds the messages payload from `pages: List[{page_number, markdown}]` (text blocks, not image_url), reuses `EXTRACTION_SCHEMA` and the existing prompt. Same `requests.post` shape; only `_build_messages` changes.
2. Split `judge.py`. Keep the public `judge_certificate` signature stable; the new `correct_against_source` is the focused function the Ariba pipeline will call.
3. `ProcessedFile` schema mirrors the columns listed in `new-flow.md` §2.3.
4. Tests + CLI.

**How I will test:**

- `pytest backend/tests/test_extractor_text.py -v` and `pytest backend/tests/test_judge_correction.py -v` → all green with mocked HTTP.
- `python -m scripts.dev_judge_sample` against the fixture produced by Phase 1 → prints a corrected JSON.
- `/api/certificates/verify` still works (regression check — the old public function is intact).

**How you test:**

```bash
cd backend
pytest tests/test_extractor_text.py tests/test_judge_correction.py -v
# Smoke test: spin up backend, upload a cert to /api/certificates/verify, see PASS/FAIL
# (unchanged behaviour)
```

**Stop signal:** the two new test files pass. `/api/certificates/verify` regressions are zero. The CLI script produces a corrected JSON for at least one sample markdown.

**Rollback:** revert `extractor.py`, `judge.py`, `schemas.py` to their last commit. New test files are safe to keep or drop.

---

## Phase 3 — Orchestrator + atomic transaction (~1.5 days)

**Goal:** add `ariba_pipeline.process_certificate` (the per-file flow) and `audit_data_access.log_audit_run_atomic` (the single-transaction write). No route uses them yet.

**Files touched:**

| File | Change |
|---|---|
| `backend/app/services/ariba_pipeline.py` | **NEW.** The orchestrator. |
| `backend/app/services/audit_data_access.py` | Add `log_audit_run_atomic(supplier_name, processed_files, audit_log) → audit_id`. Keep the old `log_audit_run` as `@deprecated` for one release. |
| `backend/tests/test_ariba_pipeline.py` | **NEW.** End-to-end test with mocked Docling + DeepSeek + Qwen + a real Neon test database. |
| `backend/tests/test_atomic_log.py` | **NEW.** Verifies rollback: force a write to fail mid-loop, then assert `SELECT COUNT(*) FROM document_evidence WHERE audit_id = 'X' = 0`. |
| `backend/scripts/dev_run_audit_sample.py` | **NEW.** CLI: takes a folder of certs → runs the orchestrator on each → prints the verdict. No DB write (dry-run mode). |

**What I will do:**

1. The orchestrator calls Docling → DeepSeek text → Qwen correction → merge → rules.diagnostic → return `ProcessedFile`. Pure async; `asyncio.gather` for parallel file processing.
2. The atomic write wraps `audit_log` + all `document_evidence` in one `session.begin()` block. The `document_evidence` insert is per-row but inside the same transaction; any exception rolls back everything.
3. Tests use a temporary Neon test database (or a Postgres testcontainer if you'd rather not hit Neon) and force a failure halfway through to prove the rollback.

**How I will test:**

- `pytest backend/tests/test_ariba_pipeline.py -v` → green; verify a 3-file audit produces 1 `audit_logs` + 3 `document_evidence` rows.
- `pytest backend/tests/test_atomic_log.py -v` → green; the failure case leaves zero rows.
- `python -m scripts.dev_run_audit_sample backend/tests/fixtures/sample_certs/ --dry-run` → prints verdicts + per-file corrections without touching the DB.

**How you test:**

```bash
cd backend
pytest tests/test_ariba_pipeline.py tests/test_atomic_log.py -v
python -m scripts.dev_run_audit_sample <folder-with-pdfs> --dry-run
# Optional: connect to Neon and verify a real run wrote the expected rows.
```

**Stop signal:** the orchestrator produces `ProcessedFile` objects with all the required fields. The atomic write either commits all rows or none. Dry-run CLI shows the pipeline end-to-end.

**Rollback:** delete `ariba_pipeline.py`, revert `audit_data_access.py`. The migration from Phase 0 stays (columns are still nullable; nothing breaks).

---

## Phase 4 — Route rewrite + deprecation (~1 day)

**Goal:** `POST /api/audit` becomes the **only** Ariba route. `/api/extract`, `/api/audit/comparison`, `/api/test/extract` are marked `@deprecated` but still work.

**Files touched:**

| File | Change |
|---|---|
| `backend/app/main.py` | Rewrite `run_audit` body. Mark the three old endpoints as `@deprecated` with a `Deprecation` header. Add lifespan-warmed Docling. |
| `backend/tests/test_run_audit.py` | **NEW.** Posts 3 files (one native, one scanned, one image) to `/api/audit`; asserts response shape + DB rows. |
| `docs/api-endpoints.md` | Mark old routes as deprecated. |

**What I will do:**

1. `run_audit` orchestrates: parse `FormData` → `asyncio.gather(ariba_pipeline.process_certificate(...))` → `auditor.run_full_audit` on the corrected list → build `AuditLogEntry` → call `log_audit_run_atomic` → return `AuditResultResponse`.
2. Old endpoints stay callable but emit `Deprecation: true` and a `Sunset: 2026-12-31` header.
3. Tests + docs.

**How I will test:**

- `pytest backend/tests/test_run_audit.py -v` → green.
- `curl -F` test of `/api/audit` with 2 sample PDFs → returns a verdict, writes 1 + 2 rows.
- `curl -F` test of `/api/extract` → still works, response includes `Deprecation: true` header.
- Regression: `/api/certificates/verify` and `/api/chat` still work (they don't touch this code path).

**How you test:**

```bash
cd backend
pytest tests/test_run_audit.py -v
# Manual:
curl -X POST http://localhost:8000/api/audit \
  -F "supplier_name=ACME Corp" \
  -F "workspace_title=Test" \
  -F "cert_type=QSHE" \
  -F 'qa_data=[]' \
  -F "files=@path/to/cert.pdf" \
  -F "screenshot=@path/to/screenshot.jpg"
# Expect: 200 OK with AuditResultResponse
```

**Stop signal:** `/api/audit` returns the verdict end-to-end. Old routes still respond (with the deprecation header). No regressions elsewhere.

**Rollback:** revert `main.py`. The deprecation header is additive; safe to leave.

---

## Phase 5 — Extension switch (~0.5 day)

**Goal:** the Chrome extension uses `POST /api/audit` and nothing else.

**Files touched:**

| File | Change |
|---|---|
| `extension/background/background.js` | Replace the two-FormData dance (lines 280–341) with a single `fetch('/api/audit', …)`. |
| `extension/panel/panel.html` | Update description text. |
| `extension/panel/panel.js` | Add the warm-up log line. |

**What I will do:**

1. Drop the Phase-1-then-Phase-2 FormData pair. One `fetch` to `/api/audit` with all the same fields. UI toast handlers unchanged.
2. Update panel copy.

**How I will test:**

- Load the extension unpacked in Chrome.
- Run the Playwright extension test (`backend/extension/tests/extension.spec.js` is the existing fixture against `mock_ariba.html`).
- Verify the panel shows: `Phase 1/2 done` then `Audit Complete! Result: …` (one toast, not two).
- Open DevTools → Network → confirm only one POST to `/api/audit` per run.

**How you test:**

```bash
cd backend/extension
npx playwright test
# Manual: open Chrome with the unpacked extension, navigate to the mock Ariba
# fixture (tests/fixtures/mock_ariba.html), click the extension icon, click
# "Run Automatic Audit". Watch the log box.
```

**Stop signal:** the Playwright test passes. Manual run on `mock_ariba.html` returns a verdict in the panel. The Stop button still aborts the in-flight request.

**Rollback:** revert `background.js` and the two panel files. The backend routes are unchanged in this phase, so nothing breaks server-side.

---

## Phase 6 — Cleanup (~0.25 day)

**Goal:** delete the legacy endpoints and the legacy module.

**Files touched:**

| File | Change |
|---|---|
| `backend/app/services/legacy_gemini_audit.py` | Delete. But **first** move `clean_question_label` to `app/services/auditor.py` (or `app/services/text_cleaning.py`) and update the two imports in `rules.py:27` and `main.py:29`. |
| `backend/app/main.py` | Delete the three deprecated endpoints and the `import` of `legacy_gemini_audit`. |
| `backend/app/services/parser.py` | Delete. Replaced by Docling. (The RAG manual-ingestion path uses it too — must update `ingest.py` first to call Docling.) |
| `backend/app/services/pdf.py` | Delete. Replaced by Docling. (Update `extractor.py` if it still references it.) |
| `backend/app/services/ingest.py` | Update to call `docling_parser.parse_to_markdown` instead of `parser.parse_pdf_to_markdown`. |
| `backend/app/services/extractor.py` | Remove the now-unused vision-mode branch from the public surface; keep `_build_messages` only if a unit test still uses it. |
| `backend/tests/test_*.py` | Remove tests for the deleted files; rerun the suite. |

**What I will do:**

1. Move `clean_question_label` first. Build. Run all tests. **Green is a precondition for the rest of this phase.**
2. Switch `ingest.py` to Docling. Build. Run all tests.
3. Delete the four legacy files. Build. Run all tests.

**How I will test:**

- `pytest backend/tests -v` → all green.
- `grep -r "legacy_gemini_audit" backend/` → no results.
- `grep -r "parser.parse_pdf_to_markdown" backend/` → no results.
- `grep -r "pdf.pdf_to_data_urls" backend/` → no results.
- Smoke test: `/api/documents/upload` still works (RAG ingestion now uses Docling).
- Smoke test: `/api/certificates/verify` still works (vision mode still available, just not called from the Ariba path anymore).

**How you test:**

```bash
cd backend
pytest tests -v
# Manual: upload a manual PDF to /api/documents/upload; verify RAG chatbot
# still finds it.
```

**Stop signal:** full test suite green, no grep hits for the deleted symbols, both RAG and certificate-verify paths still work.

**Rollback:** `git revert` the phase commit. The Docling parser is stable; this phase is mostly deletions.

---

## Phase 7 — Docs (~0.25 day)

**Goal:** update the user-facing docs to match the new pipeline.

**Files touched:**

| File | Change |
|---|---|
| `docs/api-endpoints.md` | Remove the "legacy" notes; mark `/api/audit` as the only Ariba route; document the new response fields. |
| `docs/internal/development-plan.md` | Add a short section under Phase 4 (Certificate Verification) noting the Ariba flow now uses Docling + DeepSeek + Qwen + Python rules, single-pass, atomic. |
| `docs/internal/prd.md` | Update the §3 workflow diagram (no change needed if it's already abstract) and the Tech Stack table. |
| `docs/internal/new-flow.md` | Add a final "Status: implemented 2026-…-…" line at the top. |

**What I will do:** edit the four files. No code changes.

**How I will test:** spot-read each updated file. Ensure no broken markdown links, no `TODO` markers left behind.

**How you test:** open each file in your editor. Confirm the descriptions match the behaviour you see in the running app.

**Stop signal:** all four files updated; `/docs` folder renders cleanly in your preview tool.

**Rollback:** `git revert`.

---

## What I will NOT touch

- **Frontend** (`backend/frontend/`). The Pydantic schema stays backwards-compatible, so the existing frontend should keep working. If you spot a UI bug during your testing, that's a separate issue.
- **RAG chatbot** (`/api/chat`, `/api/documents/upload`). The only touch is Phase 6 where `ingest.py` switches from `parser.py` to `docling_parser.py`. No public behaviour change.
- **Database inspector** (`/api/db/*`). Untouched.

---

## How we run this together

1. I implement Phase 0.
2. I commit + push to a branch (`feat/ariba-new-flow`).
3. I report back with: what changed, what I tested, what to look for.
4. You pull, test, and reply with **"phase 0 OK"** (or specific issues).
5. I move to Phase 1 only after your go.

If you want me to push straight through phases 0–2 in one go (low risk, all additive), say the word. Phases 3+ each need a manual sanity check from you before I continue.
