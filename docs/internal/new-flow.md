# New Ariba Flow — Docling → DeepSeek → Qwen (inline correction) → Python rules

> **Status:** Plan, approved 2026-08-05. No code edits yet.
> **Replaces:** the legacy Gemini-Worker path currently used by the Ariba Chrome extension and `backend/app/services/legacy_gemini_audit.py`.
> **Revision:** 2026-08-05 — swapped MiniMax-M3 + PyMuPDF text fallback for **Docling** (IBM OSS) as the single OCR / markdown stage. Removes the DeepSeek-vision fallback path.

---

## 0. Confirmed direction

| # | Decision | Implication |
|---|---|---|
| 0 | **Docling** is the single OCR / markdown stage | Replaces MiniMax-M3 + PyMuPDF text + DeepSeek-vision fallback. Handles native-text PDFs, scanned PDFs (built-in RapidOCR), images, DOCX, XLSX in one call. Output is structured markdown that both DeepSeek (extraction) and Qwen (cross-check) consume. |
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
│  1.  docling.parse(file_bytes, mime) → structured Markdown + page tracking     │
│        (PDF / image / DOCX / XLSX → markdown, tables preserved, no AI cost)     │
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

> **Why Docling** — Docling (IBM, OSS) is a single Python library that handles native-text PDFs, scanned PDFs (built-in OCR via RapidOCR/EasyOCR), images, DOCX, XLSX, and HTML in one call, producing structured Markdown with tables, headings, and `<!-- PAGE n -->` markers preserved. This replaces the previous MiniMax-M3 + PyMuPDF hybrid (and removes the DeepSeek-vision fallback that was needed when PyMuPDF returned empty text on scans). One library, one deterministic cost, one output format — the markdown is what DeepSeek and Qwen both consume.

---

## 2. File-by-file change set (no edits yet — this is the blueprint)

### 2.0 NEW: `backend/app/services/docling_parser.py` (the OCR / markdown stage)

Replaces **both** `parser.py` and the vision-fallback branch of `extractor.py` for the Ariba path. Docling is a single OSS library (`pip install docling`) that internally does:

- **Layout analysis** (DocLayNet-based) → reads headings, lists, columns, reading order.
- **Table extraction** (TableFormer) → emits markdown tables.
- **OCR** (RapidOCR by default; can swap to EasyOCR) → handles scanned PDFs and images.
- **Format dispatch** → PDF, DOCX, XLSX, PPTX, HTML, image — one API.

```python
# backend/app/services/docling_parser.py
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions

_PIPELINE_OPTS = PdfPipelineOptions(
    do_ocr=True,
    do_table_structure=True,
    ocr_options=None,           # use RapidOCR default
    images_scale=2.0,           # 2x render for better OCR
    generate_page_images=False,
    generate_picture_images=False,
)

_converter: DocumentConverter | None = None


def _get_converter() -> DocumentConverter:
    global _converter
    if _converter is None:
        _converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=_PIPELINE_OPTS),
                # Other formats use defaults; DocumentConverter picks the right backend.
            }
        )
    return _converter


def parse_to_markdown(
    file_bytes: bytes,
    mime_type: str,
    filename: str = "document",
    max_pages: int = 20,
) -> tuple[list[dict], float, dict]:
    """Parse any supported file to per-page markdown.

    Returns:
        pages: [{page_number: int, markdown: str}, ...]
        cost_usd: 0.0  (Docling is local)
        doc_meta: {format, page_count, has_ocr, has_tables, ...}
    """
    import io
    converter = _get_converter()
    result = converter.convert(io.BytesIO(file_bytes), raises_on_error=False)
    doc = result.document

    pages: list[dict] = []
    for i, page in enumerate(doc.pages, start=1):
        md = page.export_to_markdown() if hasattr(page, "export_to_markdown") else ""
        if not md and hasattr(doc, "export_to_markdown"):
            # Fallback: export whole doc, then split on page markers
            md = doc.export_to_markdown()
        pages.append({"page_number": i, "markdown": md or ""})
        if len(pages) >= max_pages:
            break

    # Defensive: if Docling returned a single doc-level markdown without per-page
    # breakdown, wrap it as page 1 so the downstream consumers always see pages[].
    if not pages and hasattr(doc, "export_to_markdown"):
        full = doc.export_to_markdown()
        if full:
            pages.append({"page_number": 1, "markdown": full})

    doc_meta = {
        "format": result.format.value if result.format else "unknown",
        "page_count": len(pages),
        "has_ocr": any(getattr(p, "has_ocr", False) for p in (doc.pages or [])),
        "has_tables": bool(getattr(doc, "tables", None)),
    }
    return pages, 0.0, doc_meta
```

#### Why Docling over MiniMax / PyMuPDF

| Concern | MiniMax M3 + PyMuPDF (old) | Docling (new) |
|---|---|---|
| Cost per parse | ~$0.0003 (MiniMax API) | $0 (local CPU/GPU) |
| Latency | 1–3 s (API roundtrip) | 0.5–2 s on CPU, <0.5 s on GPU |
| Scanned PDFs | Needs a separate vision path (DeepSeek-vision fallback) | Handled natively by RapidOCR |
| Tables | MiniMax preserves them; PyMuPDF plain text loses them | TableFormer emits markdown tables |
| DOCX / XLSX | Not supported in the old flow | Supported out of the box |
| Vendor lock-in | MiniMax API key required | None — fully OSS (MIT) |
| Failure mode | API down → pipeline down | Local process; if Docling fails, we still have the option to fall back to PyMuPDF text for native-text PDFs |

#### Performance note

Docling loads its layout + OCR models into memory on first call (~2 GB RAM for default pipeline). For serverless / short-lived containers, this means **the first request after a cold start is slow** (10–30 s for model load). Mitigations:

- **Warm-up on startup** in `backend/app/main.py` lifespan handler — call `_get_converter()` once at boot so the first user request doesn't pay the cold-start tax.
- **Persistent worker process** — Cloud Run / Gunicorn `--workers 1 --timeout 120` for the first minute, then scale out once the model is hot.
- **Optional GPU** — if Cloud Run GPU is enabled, Docling is ~5× faster on the OCR stage.

#### Cost column change

`document_evidence` no longer needs a `parse_cost_usd` column (Docling is free). If the team wants to track in-process compute time for billing visibility, add `parse_duration_ms` instead — same data, clearer semantics. (Listed in §2.4 column table below.)

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

1. `docling.parse_to_markdown(file_bytes, mime_type)` — **new** wrapper around the Docling `DocumentConverter`. Handles native-text PDFs, scanned PDFs (built-in OCR), images, DOCX, XLSX in one call. Returns `(pages: List[{page_number, markdown}], docling_cost_usd: 0.0, doc_meta: dict)`. Cost is zero in the steady state (local CPU/GPU). The first request per process pays a one-time model-load cost (not billed).
2. `deepseek.extract_from_text(pages, question_label)` — **new** function: reuses `EXTRACTION_SCHEMA` and prompt from `extractor.py:25-62, 110-123`, but builds messages from text blocks `{"type": "text", "text": f"<!-- PAGE {n} -->\n{markdown}"}` instead of image blocks. Returns `(extracted_data, in_t, out_t, cost)`. Vision mode (`extractor.extract_certificate_data`) is no longer reached in the Ariba path.
3. `qwen.correct_against_source(extracted_data, pages_markdown, supplier_name, ariba_qa_answers, qa_data_title)` — **new** function. Prompt = EXTRACTED_DATA + SOURCE_PAGES (markdown, truncated to ~12k tokens) + DETERMINISTIC_RULE_RESULT. Asks Qwen for a JSON response with the new schema (see §2.3). Returns `(corrected_extracted_data, qwen_status, qwen_reasoning, qwen_confidence, qwen_corrections: Dict, qwen_in_t, qwen_out_t, qwen_cost)`.
4. `rules.verify_document(corrected_extracted_data, supplier_name, …)` — **reuse** the function that already exists at `rules.py:56-160`. The result is recorded but **not used for the verdict** — the verdict still comes from `auditor.run_full_audit`. We only use it as a diagnostic payload that travels to the DB (so the frontend can show "rules saw X, Qwen saw Y, final verdict is Z").
5. Returns `ProcessedFile` (dataclass in §2.3) carrying everything.

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

    # Docling parse
    parse_model: str = "docling"
    parse_duration_ms: int
    parse_format: str
    parse_page_count: int
    parse_has_ocr: bool
    parse_has_tables: bool
    source_markdown: str                 # concatenated "<!-- PAGE n -->\n…"

    # DeepSeek raw
    deepseek_extracted_data: dict
    deepseek_input_tokens: int
    deepseek_output_tokens: int
    deepseek_cost_usd: float

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
| `parse_model` | `String(50)` | `"docling"` — who produced the markdown |
| `parse_duration_ms` | `Integer` | Wall-clock time for Docling on this file (Docling is free, so we track time instead of cost) |
| `parse_format` | `String(50)` | `"pdf" / "image" / "docx" / "xlsx" / "html"` — what Docling saw |
| `parse_page_count` | `Integer` | Number of pages returned by Docling |
| `parse_has_ocr` | `Boolean` | True if OCR was needed (scanned PDF) |
| `parse_has_tables` | `Boolean` | True if Docling detected ≥1 table |
| `source_markdown` | `Text` | Concatenated per-page markdown used for Qwen cross-check |
| `extraction_model` | `String(50)` | `"deepseek"` (or future) — which model extracted |
| `extraction_input_tokens` | `Integer` (rename from `input_tokens`) | DeepSeek input tokens |
| `extraction_output_tokens` | `Integer` (rename from `output_tokens`) | DeepSeek output tokens |
| `extraction_cost_usd` | `Numeric(12,6)` (rename from `cost_usd`) | DeepSeek cost |
| `qwen_corrections` | `JSONB` | Qwen's `corrected_fields` |
| `qwen_status` | `String(50)` | Qwen's own PASS/FAIL/REQUIRES_HUMAN_REVIEW |
| `qwen_reasoning` | `Text` | CoT trace from Qwen |
| `qwen_confidence` | `Numeric(4,3)` | 0.000 – 1.000 |
| `qwen_input_tokens` | `Integer` | |
| `qwen_output_tokens` | `Integer` | |
| `qwen_cost_usd` | `Numeric(12,6)` | |
| `corrected_extracted_data` | `JSONB` | The post-Qwen JSON (what `auditor.run_full_audit` ran on) |

> The `is_vision_fallback` column from the earlier draft is **removed** — Docling replaces both the native-text path and the DeepSeek-vision path, so there is no separate vision branch to flag.

The existing `input_tokens / output_tokens / cost_usd` columns stay as **legacy** aliases to the new extraction_* columns so the frontends that read them via `DocumentEvidence` schema don't break — we keep the Pydantic schema backwards-compatible.

Add to **`audit_logs`** (`models/tables.py:181-208`):

| Column | Type | Purpose |
|---|---|---|
| `parse_total_duration_ms` | `Integer` | Sum of Docling time across files (in-process cost signal) |
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
                    parse_model=pf.parse_model,
                    parse_duration_ms=pf.parse_duration_ms,
                    parse_format=pf.parse_format,
                    parse_page_count=pf.parse_page_count,
                    parse_has_ocr=pf.parse_has_ocr,
                    parse_has_tables=pf.parse_has_tables,
                    source_markdown=pf.source_markdown,
                    extraction_model="deepseek",
                    extraction_input_tokens=pf.deepseek_input_tokens,
                    extraction_output_tokens=pf.deepseek_output_tokens,
                    extraction_cost_usd=pf.deepseek_cost_usd,
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
| Docling fails on a specific file (model crash, unsupported sub-format) | Medium | `parse_to_markdown` raises; `ariba_pipeline.process_certificate` catches and falls back to `extractor.extract_certificate_data` (vision mode) for that one file. Marked in `parse_format` as `"docling_failed"`. UI shows a warning. |
| Docling cold-start is slow on serverless (10–30 s model load) | High on first request | Warm-up in `main.py` lifespan handler + Cloud Run min-instances=1 in prod. Documented in §2.0. |
| Docling exceeds 2 GB memory on a large cert scan | Low | Cap `max_pages=20` per file; if a file exceeds that, log a warning and pass only the first 20 pages to DeepSeek. |
| `session.begin()` rolls back when only one evidence row's column write fails | Low | Per-row `try/except` is **not** used inside the transaction; we want all-or-nothing. Failures bubble up; the panel shows "Audit failed" with no rows written. |
| `legacy_gemini_audit.clean_question_label` import breaks after the legacy file is deleted | High if missed | Move the helper to `auditor.py` or a new `app/services/text_cleaning.py` and update imports **before** deleting the legacy file. |
| Cost overrun if Qwen is invoked on every file even for already-cached DeepSeek extractions | Low | Per-file dedup uses `file_hash + ariba_question_label` (the existing key at `audit_data_access.find_metadata_by_hash:258-275`); if a cached `corrected_extracted_data` exists, we skip Docling + DeepSeek + Qwen entirely. |

---

## 5. Acceptance criteria

A change-set is shippable when **all** of the following are true:

1. Extension `background.js` calls only `POST /api/audit`. No code path references `/api/extract` or `/api/audit/comparison` from the extension.
2. Backend `/api/audit` returns the same `AuditResultResponse` shape the extension already reads.
3. For a 3-file supplier with two native-text PDFs and one scanned PDF, the pipeline produces:
   - 1 `audit_logs` row, 3 `document_evidence` rows, all in one transaction (or 0 rows on any failure).
   - All 3 rows have `parse_model = "docling"`, `source_markdown` non-empty, `parse_duration_ms` populated.
   - The scanned row has `parse_has_ocr = true`; the other two have `parse_has_ocr = false`.
   - 3 rows with non-empty `qwen_corrections` (or an explicit `{}` if Qwen was unreachable and the fallback fired).
4. `auditor.run_full_audit` is invoked **exactly once** per audit, on the post-Qwen JSON.
5. A simulated network drop between the response and the DB commit leaves **zero** rows in Neon (verify with `SELECT COUNT(*) FROM document_evidence WHERE audit_id = 'X'`).
6. `GET /api/evidence?audit_id=X` returns the `corrected_extracted_data` (renamed column) so the frontend can show the final, post-Qwen values.
7. `PUT /api/evidence` with a human-edited JSON updates both the evidence row and the audit_logs row in one transaction, and `auditor.run_full_audit` is re-run on the human-edited data.
8. `legacy_gemini_audit.py` is deleted only after `/api/extract`, `/api/audit/comparison`, and `/api/test/extract` are removed and no remaining import references it.
9. Docling model is loaded once at app startup; the first audit request after a cold start completes in <2 s on CPU and <0.5 s on GPU (not counting the one-time model load).

---

## 6. Implementation order (one PR per step)

1. **PR-1 (DB only):** Alembic migration adding the new columns and the unique constraint. No code change. Ship first so we can roll back independently if the schema is wrong.
2. **PR-2 (services):** Add `docling_parser.parse_to_markdown`, `extractor.extract_from_text`, `judge.correct_against_source`, the new `ProcessedFile` schema, and `ariba_pipeline.process_certificate`. Wire unit tests around the four steps. Don't change any route yet.
3. **PR-3 (route):** Rewrite `POST /api/audit` to use the new pipeline. Mark `/api/extract` and `/api/audit/comparison` as deprecated. Add `log_audit_run_atomic`. Verify against the acceptance criteria above using the Playwright extension test harness.
4. **PR-4 (extension):** Switch `background.js` to the single-pass `POST /api/audit` call. Remove the FormData dance.
5. **PR-5 (cleanup):** Delete `/api/extract`, `/api/audit/comparison`, `/api/test/extract`, and `legacy_gemini_audit.py` (after moving `clean_question_label`).
6. **PR-6 (docs):** Update `docs/api-endpoints.md` and `docs/internal/development-plan.md` to reflect the new pipeline.

---

## 7. Estimated effort

| Step | Effort | Notes |
|---|---|---|
| PR-1 migration | 0.5 day | Pure SQL + Alembic. |
| PR-2 services | 3–4 days | Docling integration (model load, OCR fallback to vision) + the new DeepSeek text-mode extractor is the riskiest piece; needs a small eval against 20–30 sample certs (mix of native-text + scanned). |
| PR-3 route | 1 day | Mostly mechanical once PR-2 lands. |
| PR-4 extension | 0.5 day | ~20 lines changed in `background.js`. |
| PR-5 cleanup | 0.25 day | Mechanical. |
| PR-6 docs | 0.25 day | Mechanical. |
| **Total** | **~5.5–7 days** | Single engineer. Add ~1 day if Cloud Run cold-start tuning is needed. |
