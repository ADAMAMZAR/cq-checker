# New Ariba Flow — MiniMax/OCR → DeepSeek → Qwen (inline correction) → Python rules

> **Status:** Plan, approved 2026-08-05. No code edits yet.
> **Replaces:** the legacy Gemini-Worker path currently used by the Ariba Chrome extension and `backend/app/services/legacy_gemini_audit.py`.

---

## 0. Confirmed direction

| # | Decision | Implication |
|---|---|---|
| 1 | Qwen **corrects inline** | New Qwen response carries `corrected_fields: {…}`; backend merges them over the DeepSeek JSON. Corrected values become new persistent columns so the UI can show "DeepSeek said X, Qwen corrected to Y". |
| 2 | Qwen **does not run the audit** | Qwen's job is only field correctness vs the source markdown. `auditor.run_full_audit` runs on the post-Qwen JSON and stays the source of truth for `result` and `comparison_table`. |
| 3 | Single-pass + atomic transaction | Extension calls `POST /api/audit` (already exists, currently unused). `log_audit_run` is wrapped in one SQLAlchemy transaction; if anything throws, **zero** rows are committed. The retry button is removed; only **Edit** remains for human overrides. |

---

## 1. New pipeline at a glance

```
┌─ Ariba page (Chrome ext) ──────────────────────────────────────────────────────┐
│  panel → content.js → POST /api/audit  (single form: files + qa + screenshot) │
└───────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─ Backend /api/audit (atomic) ─────────────────────────────────────────────────┐
│ for each file:                                                                  │
│  1.  parser.parse_to_text_or_markdown(file_bytes, mime)                        │
│        ├─ PDF native-text → parser._pyMuPDF_pages → List[{page,text}]          │
│        ├─ PDF scan      → pdf.pdf_to_images → "see note below"                 │
│        └─ Image         → single-page text placeholder, image kept aside      │
│  2.  deepseek.extract_from_text(markdown, qa_label)  (text mode, cheap)         │
│  3.  qwen.correct_against_source(deepseek_json, source_markdown)               │
│        → returns {status, reasoning_trace, confidence, corrected_fields}       │
│  4.  merge corrected_fields over deepseek_json → corrected_extracted_data       │
│  5.  rules.verify_document(corrected_extracted_data, supplier, …)              │
│  6.  auditor.run_full_audit(supplier, file_contexts, [corrected_extracted_data])│
│  7.  STORE file (object storage) + db record (deepseek_json, qwen_corrections, │
│       corrected_extracted_data)                                                │
│ ───────────────────────────────────────────────────────────────────────────── │
│ ATOMIC COMMIT: audit_log + all document_evidence rows, or none                 │
└───────────────────────────────────────────────────────────────────────────────┘
```

> **Note on PDF scans** — if `parser._pyMuPDF_pages` returns empty/short text, we render pages to JPEG with `pdf.pdf_to_images` (already at `pdf.py:19-53`, 200 DPI, q=85, 10-page cap) and pass those images into **DeepSeek in vision mode** (the current `extractor._build_messages` path at `extractor.py:97-130` is reused). The hybrid is automatic: native text first (free, accurate), vision only when forced. This avoids wasting vision tokens on every document.

---

## 2. File-by-file change set (no edits yet — this is the blueprint)

### 2.1 NEW: `backend/app/services/ariba_pipeline.py` (the orchestrator)

Single-purpose module that owns the per-file flow above. Exposes one function:

```python
async def process_certificate(
    file_bytes: bytes,
    mime_type: str,
    filename: str,
    supplier_name: str,
    ariba_question_label: str,
    ariba_qa_answers: str,
    qa_data_title: str,
) -> ProcessedFile  # dataclass: see schema below
```

Internally calls, in order:

1. `parser.parse_to_text_or_markdown(file_bytes, mime_type)` — **new** helper wrapping both `_pyMuPDF_pages` and the MiniMax M3 PDF→markdown path already in `parser.py:47-105`. Returns `(pages: List[{page_number, text}], is_markdown: bool, parse_cost_usd)`.
2. If `is_markdown=False` AND pages is empty → fall back to `pdf.pdf_to_data_urls` and call `extractor.extract_certificate_data` (vision mode, unchanged).
3. `deepseek.extract_from_text(pages, question_label)` — **new** function: reuses `EXTRACTION_SCHEMA` and prompt from `extractor.py:25-62, 110-123`, but builds messages from text blocks `{"type": "text", "text": f"<!-- PAGE {n} -->\n{text}"}` instead of image blocks. Returns `(extracted_data, in_t, out_t, cost)`.
4. `qwen.correct_against_source(extracted_data, pages_markdown, supplier_name, ariba_qa_answers, qa_data_title)` — **new** function. Prompt = EXTRACTED_DATA + SOURCE_PAGES (markdown, truncated to ~12k tokens) + DETERMINISTIC_RULE_RESULT. Asks Qwen for a JSON response with the new schema (see §2.2). Returns `(corrected_extracted_data, qwen_status, qwen_reasoning, qwen_confidence, qwen_corrections: Dict, qwen_in_t, qwen_out_t, qwen_cost)`.
5. `rules.verify_document(corrected_extracted_data, supplier_name, …)` — **reuse** the function that already exists at `rules.py:56-160`. The result is recorded but **not used for the verdict** — the verdict still comes from `auditor.run_full_audit`. We only use it as a diagnostic payload that travels to the DB (so the frontend can show "rules saw X, Qwen saw Y, final verdict is Z").
6. Returns `ProcessedFile` (dataclass in §2.3) carrying everything.

### 2.2 NEW: change `app/services/judge.py` — split into two functions

Today `judge.py:39-123` is one function that runs rules + Qwen + derives status. Split it cleanly:

```python
# NEW: only does CoT over (extracted, source markdown) → corrected fields + Qwen's
# own PASS/FAIL suggestion. Does NOT touch the audit verdict.
async def correct_against_source(
    extracted_data: dict,
    source_markdown: str,
    supplier_name: str,
    ariba_question_label: str,
    ariba_qa_answers: str,
    qa_data_title: str,
) -> dict:
    return {
        "status": "PASS" | "FAIL" | "REQUIRES_HUMAN_REVIEW",   # Qwen's own view
        "reasoning_trace": str,
        "confidence": float,
        "corrected_fields": {field: value, ...},                # only fields Qwen changed
        "input_tokens": int,
        "output_tokens": int,
        "cost_usd": float,
        "judge_source": "qwen" | "rules",
    }

# KEPT (refactored): keep the existing helper _derive_status_from_rules(rule) so we
# can fall back when Qwen is down — same behaviour as today.
```

If Qwen is unreachable, the function returns `corrected_fields = {}` and `judge_source = "rules"`, the verdict suggestion falls back to `_derive_status_from_rules(rule)` (unchanged).

### 2.3 `backend/app/schemas.py` — add `ProcessedFile`

```python
class ProcessedFile(BaseModel):
    filename: str
    file_hash: str
    file_url: Optional[str]
    ariba_question_label: str
    ariba_qa_answers: str
    ariba_cert_type: str
    file_content_type: str

    # DeepSeek raw
    deepseek_extracted_data: dict
    deepseek_input_tokens: int
    deepseek_output_tokens: int
    deepseek_cost_usd: float

    # Source pages
    source_markdown: str                 # concatenated "<!-- PAGE n -->\n…"
    is_vision_fallback: bool             # true if DeepSeek got images, not text

    # Qwen corrections
    qwen_status: str                     # PASS / FAIL / REQUIRES_HUMAN_REVIEW
    qwen_reasoning: str
    qwen_confidence: float
    qwen_corrections: dict               # corrected_fields (only what changed)
    qwen_input_tokens: int
    qwen_output_tokens: int
    qwen_cost_usd: float

    # Final, post-correction JSON that rules + audit run on
    corrected_extracted_data: dict
```

This dataclass carries everything we need to persist evidence + run the audit + render the UI later.

### 2.4 `backend/app/models/tables.py` — extend `document_evidence` and `audit_logs`

Add to **`document_evidence`** (`models/tables.py:211-229`):

| Column | Type | Purpose |
|---|---|---|
| `extraction_model` | `String(50)` | `"deepseek"` (or future) — which model extracted |
| `extraction_input_tokens` | `Integer` (rename from `input_tokens`) | DeepSeek input tokens |
| `extraction_output_tokens` | `Integer` (rename from `output_tokens`) | DeepSeek output tokens |
| `extraction_cost_usd` | `Numeric(12,6)` (rename from `cost_usd`) | DeepSeek cost |
| `source_markdown` | `Text` | Concatenated markdown used for Qwen cross-check |
| `is_vision_fallback` | `Boolean` | True when DeepSeek got images, not text |
| `qwen_corrections` | `JSONB` | Qwen's `corrected_fields` |
| `qwen_status` | `String(50)` | Qwen's own PASS/FAIL/REQUIRES_HUMAN_REVIEW |
| `qwen_reasoning` | `Text` | CoT trace from Qwen |
| `qwen_confidence` | `Numeric(4,3)` | 0.000 – 1.000 |
| `qwen_input_tokens` | `Integer` | |
| `qwen_output_tokens` | `Integer` | |
| `qwen_cost_usd` | `Numeric(12,6)` | |
| `corrected_extracted_data` | `JSONB` | The post-Qwen JSON (what `auditor.run_full_audit` ran on) |

The existing `input_tokens / output_tokens / cost_usd` columns stay as **legacy** aliases to the new extraction_* columns so the frontends that read them via `DocumentEvidence` schema don't break — we keep the Pydantic schema backwards-compatible.

Add to **`audit_logs`** (`models/tables.py:181-208`):

| Column | Type | Purpose |
|---|---|---|
| `judge_total_input_tokens` | `Integer` | Sum of Qwen input tokens across files |
| `judge_total_output_tokens` | `Integer` | Sum of Qwen output tokens across files |
| `judge_total_cost_usd` | `Numeric(12,6)` | Sum of Qwen cost across files |
| `judge_status_aggregate` | `String(50)` | "PASS" / "FAIL" / "MIXED" — Qwen's rollup across all files (diagnostic only, audit verdict stays Match/Mismatch) |

This requires one Alembic migration. Plan to add at `migrations/versions/`.

### 2.5 `backend/app/services/audit_data_access.py` — atomic `log_audit_run` (Option B)

The current `log_audit_run` (`audit_data_access.py:324-434`) does **two** commits inside one `async with factory() as session:` block: one for the audit log (line 379) and another for the evidence loop (line 415). The async session auto-flushes between awaits but the commits are separate, so a crash between them leaves orphan evidence rows.

Rewrite as one `async with session.begin():` block:

```python
async def log_audit_run_atomic(
    supplier_name: str,
    processed_files: List[ProcessedFile],   # from §2.3
    audit_log: AuditLog,
) -> Optional[str]:
    # 1. Get-or-create supplier (own transaction; idempotent, tiny)
    supplier_id = await get_or_create_supplier(supplier_name)
    audit_id   = audit_log.audit_id or await get_next_audit_id()

    # 2. Pre-compute anything that touches DB only after the big block
    factory = get_session_factory()
    async with factory() as session:
        # If both writes succeed → commit. If anything raises → ROLLBACK.
        async with session.begin():
            log_repo = AuditLogRepository(session)
            await log_repo.create(AuditLog(...))                # 1 INSERT

            ev_repo = DocumentEvidenceRepository(session)
            for pf in processed_files:
                await ev_repo.create(NeonDocumentEvidence(     # N INSERTs
                    audit_id=audit_id,
                    supplier_id=supplier_id,
                    filename=pf.filename,
                    ariba_question_label=pf.ariba_question_label,
                    ariba_qa_answers=pf.ariba_qa_answers,
                    gemini_extracted_supplier_name=
                        pf.corrected_extracted_data.get("certificateOwnerName", ""),
                    gemini_extracted_metadata=
                        json.dumps(pf.corrected_extracted_data),  # back-compat: same shape
                    file_content_type=pf.file_content_type,
                    input_tokens=pf.deepseek_input_tokens,        # alias
                    output_tokens=pf.deepseek_output_tokens,      # alias
                    cost_usd=pf.deepseek_cost_usd,                # alias
                    file_hash=pf.file_hash,
                    file_url=pf.file_url,
                    # NEW columns:
                    extraction_model="deepseek",
                    extraction_input_tokens=pf.deepseek_input_tokens,
                    extraction_output_tokens=pf.deepseek_output_tokens,
                    extraction_cost_usd=pf.deepseek_cost_usd,
                    source_markdown=pf.source_markdown,
                    is_vision_fallback=pf.is_vision_fallback,
                    qwen_corrections=pf.qwen_corrections,
                    qwen_status=pf.qwen_status,
                    qwen_reasoning=pf.qwen_reasoning,
                    qwen_confidence=pf.qwen_confidence,
                    qwen_input_tokens=pf.qwen_input_tokens,
                    qwen_output_tokens=pf.qwen_output_tokens,
                    qwen_cost_usd=pf.qwen_cost_usd,
                    corrected_extracted_data=pf.corrected_extracted_data,
                ))
    return audit_id
```

Atomicity guarantee:

- `session.begin()` opens a transaction; everything inside either commits as a block or rolls back on any exception.
- The supplier `get_or_create` runs **outside** the big block because it does its own commit (and is idempotent). The order is: supplier → evidence+log. If the second step fails, the supplier row remains (acceptable: it's a name row, no harm).
- Add a **unique constraint** on `document_evidence(audit_id, filename)` so a partial retry can never produce duplicate evidence rows. Cheap, in the same migration.

### 2.6 `backend/app/main.py` — new single-pass route, retire the two-pass

- `POST /api/audit` (`main.py:425-530`) becomes the **only** Ariba route. Re-implement its body to:

```python
@app.post("/api/audit", response_model=AuditResultResponse, tags=["Supplier Audit — Full Run"])
async def run_audit(
    supplier_name: str = Form(...),
    supplier_folder: Optional[str] = Form(None),
    workspace_title: str = Form(...),
    cert_type: str = Form(...),
    qa_data: str = Form(...),
    files: List[UploadFile] = File(...),
    screenshot: Optional[UploadFile] = File(None),
):
    # 1. Per file (parallel via asyncio.gather):
    #    ariba_pipeline.process_certificate(...) → ProcessedFile
    # 2. Run auditor.run_full_audit on [pf.corrected_extracted_data]
    # 3. Build AuditLogEntry with all the Qwen + DeepSeek cost rollups
    # 4. Call audit_data_access.log_audit_run_atomic(supplier_name, pfs, audit_log)
    # 5. Return AuditResultResponse
```

- **`POST /api/extract` (`main.py:268-324`) and `POST /api/audit/comparison` (`main.py:327-422`) are marked `@deprecated` and remain in place only for backwards compat with anything that still calls them.** The plan is to remove them after one release cycle. The extension is the only known caller; we're switching it to `/api/audit`.

- **`/api/test/extract` (`main.py:250-266`) is also removed** because it tests the dead path.

- `PUT /api/evidence` (`main.py:172-248`) **stays**, but its docstring + behaviour are updated:

  > "Re-run the audit with a human-edited corrected_extracted_data. Use this when the auditor misread the certificate; it is not a retry of a failed run."

  Internally, it accepts `updated_metadata` (the human-edited JSON) and re-runs `auditor.run_full_audit` on it; updates the existing `document_evidence.corrected_extracted_data` column + the parent `audit_logs` row in **one transaction** (same atomic pattern as §2.5). This means **"Edit"** in the UI is always safe: either the human override lands cleanly, or nothing changes.

### 2.7 `extension/background/background.js` — drop the two-FormData dance

Replace `background.js:280-349` (Phase 1 + Phase 2 FormData + fetch) with a single call:

```js
// after files are downloaded + screenshot captured:
const formData = new FormData();
formData.append('supplier_name', rawSupplierName);
formData.append('supplier_folder', s);
formData.append('workspace_title', workspaceTitle);
formData.append('cert_type', certType);
formData.append('qa_data', JSON.stringify(extractedQAData));
fileBlobs.forEach(fb => formData.append('files', fb.blob, fb.filename));
if (screenshotBlob) formData.append('screenshot', screenshotBlob, 'verification_screenshot.jpg');

const resp = await fetch(`${BACKEND_URL}/api/audit`, { method: 'POST', body: formData });
if (!resp.ok) throw new Error(`Audit endpoint returned HTTP ${resp.status}`);
const auditResult = await resp.json();
// -> notifyPanel(`Audit Complete! Result: ${auditResult.result}`, false, true);
// -> notifyPanel(`Suggested auditor comment: "${auditResult.suggested_comment}"`, false, true);
// -> notifyAribaTab(tabId, `Audit completed. Result: ${auditResult.result}`);
```

The `auditResult` payload adds nothing the extension needs to handle — same `AuditResultResponse` it already consumed. So the UI code at `background.js:346-349` stays byte-for-byte.

**The retry path is gone** — `background.js` no longer talks to `/api/extract` or `/api/audit/comparison`. The Stop button still works (it aborts the in-flight `/api/audit` fetch via the existing `AbortController` at `background.js:126-128`).

### 2.8 `extension/panel/panel.html` and `panel/panel.js` — UI label cleanup

The "Run Automatic Audit" button label is fine. There is currently no retry button in the panel — the retry UX lives on the Ariba content script's overlay and the legacy `_postResult` toast. ✅

Changes in `panel.js`:
- Update the description text in `panel/panel.html:19-20` from "download documents and execute the compliance audit" to "extract certificate data, verify it against the source document, and produce a verdict" so the user understands the new pipeline.
- Add a `console.log` line in the panel confirming the new endpoint is being hit (helpful when debugging the extension in dev).

### 2.9 `backend/app/services/legacy_gemini_audit.py` — schedule for deletion

Keep the file in place until `/api/extract` and `/api/audit/comparison` are removed (§2.6). Once those endpoints are deleted, the module becomes unreferenced and can be deleted in one PR. `legacy_gemini_audit.clean_question_label` is imported by `rules.py:27` and `main.py:29`; that helper must be moved to a non-legacy location (e.g. `app/services/auditor.py` or a new `app/services/text_cleaning.py`) before the legacy file is deleted.

### 2.10 `docs/api-endpoints.md` — update the route map

Mark `/api/extract` and `/api/audit/comparison` as **legacy / deprecated** and point the Supplier Audit workflow line to `/api/audit`. Add the new response fields to the `AuditResultResponse` schema description.

### 2.11 `docs/internal/development-plan.md` and `prd.md` — record the new pipeline

Add a short section under Phase 4 (Certificate Verification) noting that the Ariba flow now also uses DeepSeek + Qwen + Python rules, and the two-phase → single-phase migration. The RAG chatbot remains unchanged (Phase 6).

---

## 3. Open question — do you want the Qwen corrections to also feed the RAG index?

Today the `compiled_extracted_data` on `audit_logs` is a JSON dump of every file's extraction. With the new pipeline we also have a `corrected_extracted_data` per file. Two options:

- **Option X — keep audit-only.** `corrected_extracted_data` lives in `document_evidence` and `compiled_extracted_data` is built from it. The RAG chatbot continues to read from the manual-documents index (`/api/documents/upload` path) — no change.
- **Option Y — also embed.** After a successful audit, take the post-correction JSON + source markdown, embed via `embeddings.embed_texts`, and push into `child_chunks` so users can ask the chatbot "show me all certificates expiring in 2027 for supplier X". Requires an additional `ariba_to_rag` repository function and a column on `audit_logs.rag_indexed` to track it.

My recommendation: **Option X** for this release. Adding RAG indexing is a separate concern and shouldn't gate the pipeline swap. Confirm before I lock the plan.

---

## 4. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Qwen emits `corrected_fields` whose values fail the JSON schema (extra keys, wrong types) | Medium | `correct_against_source` validates every key against `EXTRACTION_SCHEMA`; drops unknown keys, casts types; logs warnings to `qwen_reasoning`. |
| Qwen reorders dates or rewrites `expirationDate` into a non-DD/MM/YYYY form | Medium | Date fields are normalised through `_normalize_date` (`auditor.py:54-61`) before being merged. |
| DeepSeek text-mode misses a field that vision-mode would have caught (e.g. tiny text in a scan rendered as a hybrid) | Low | The `is_vision_fallback` flag is set whenever DeepSeek runs in vision mode so the UI can show "this row used vision OCR (lower accuracy)" — same UX today. |
| `session.begin()` rolls back when only one evidence row's column write fails | Low | Per-row `try/except` is **not** used inside the transaction; we want all-or-nothing. Failures bubble up; the panel shows "Audit failed" with no rows written. |
| `legacy_gemini_audit.clean_question_label` import breaks after the legacy file is deleted | High if missed | Move the helper to `auditor.py` or a new `app/services/text_cleaning.py` and update imports **before** deleting the legacy file. |
| Cost overrun if Qwen is invoked on every file even for already-cached DeepSeek extractions | Low | Per-file dedup uses `file_hash + ariba_question_label` (the existing key at `audit_data_access.find_metadata_by_hash:258-275`); if a cached `corrected_extracted_data` exists, we skip DeepSeek and Qwen entirely. |

---

## 5. Acceptance criteria

A change-set is shippable when **all** of the following are true:

1. Extension `background.js` calls only `POST /api/audit`. No code path references `/api/extract` or `/api/audit/comparison` from the extension.
2. Backend `/api/audit` returns the same `AuditResultResponse` shape the extension already reads.
3. For a 3-file supplier with two native-text PDFs and one scanned PDF, the pipeline produces:
   - 1 `audit_logs` row, 3 `document_evidence` rows, all in one transaction (or 0 rows on any failure).
   - 1 row with `is_vision_fallback = true`, 2 rows with `is_vision_fallback = false`.
   - 3 rows with non-empty `qwen_corrections` (or an explicit `{}` if Qwen was unreachable and the fallback fired).
4. `auditor.run_full_audit` is invoked **exactly once** per audit, on the post-Qwen JSON.
5. A simulated network drop between the response and the DB commit leaves **zero** rows in Neon (verify with `SELECT COUNT(*) FROM document_evidence WHERE audit_id = 'X'`).
6. `GET /api/evidence?audit_id=X` returns the `corrected_extracted_data` (renamed column) so the frontend can show the final, post-Qwen values.
7. `PUT /api/evidence` with a human-edited JSON updates both the evidence row and the audit_logs row in one transaction, and `auditor.run_full_audit` is re-run on the human-edited data.
8. `legacy_gemini_audit.py` is deleted only after `/api/extract`, `/api/audit/comparison`, and `/api/test/extract` are removed and no remaining import references it.

---

## 6. Implementation order (one PR per step)

1. **PR-1 (DB only):** Alembic migration adding the new columns and the unique constraint. No code change. Ship first so we can roll back independently if the schema is wrong.
2. **PR-2 (services):** Add `parser.parse_to_text_or_markdown`, `extractor.extract_from_text`, `judge.correct_against_source`, the new `ProcessedFile` schema, and `ariba_pipeline.process_certificate`. Wire unit tests around the four steps. Don't change any route yet.
3. **PR-3 (route):** Rewrite `POST /api/audit` to use the new pipeline. Mark `/api/extract` and `/api/audit/comparison` as deprecated. Add `log_audit_run_atomic`. Verify against the acceptance criteria above using the Playwright extension test harness.
4. **PR-4 (extension):** Switch `background.js` to the single-pass `POST /api/audit` call. Remove the FormData dance.
5. **PR-5 (cleanup):** Delete `/api/extract`, `/api/audit/comparison`, `/api/test/extract`, and `legacy_gemini_audit.py` (after moving `clean_question_label`).
6. **PR-6 (docs):** Update `docs/api-endpoints.md` and `docs/internal/development-plan.md` to reflect the new pipeline.

---

## 7. Estimated effort

| Step | Effort | Notes |
|---|---|---|
| PR-1 migration | 0.5 day | Pure SQL + Alembic. |
| PR-2 services | 2–3 days | The new DeepSeek text-mode extractor is the riskiest piece; needs a small eval against 20–30 sample certs. |
| PR-3 route | 1 day | Mostly mechanical once PR-2 lands. |
| PR-4 extension | 0.5 day | ~20 lines changed in `background.js`. |
| PR-5 cleanup | 0.25 day | Mechanical. |
| PR-6 docs | 0.25 day | Mechanical. |
| **Total** | **~5–6 days** | Single engineer, no waiting on infra. |
