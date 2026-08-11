"""Docling Parser Service (IBM Open-Source OCR & Markdown Pipeline).

Provides local single-pass layout analysis, RapidOCR, table structure extraction,
and per-page markdown generation for PDFs, images, DOCX, and XLSX files.

Performance design (CPU-first):
- Single full pipeline (``do_ocr=True``, TableFormer accurate) — the same
  accuracy profile as the original parser. ``OcrMode.DEFAULT`` (PDF-aware
  layout regions) means OCR only runs on regions without embedded text, so
  native-text pages are not OCR'd twice while scanned pages are covered.
- Uses the threaded ``StandardPdfPipeline`` (Docling's multi-stage pipeline)
  with an explicit accelerator thread count, tuned batch sizes and a document
  timeout.
- PDFs are processed in bounded page-chunks so memory stays low on ~8 GB hosts
  (a single-pass 16-page document OOMs with ``std::bad_alloc``).
- In-process LRU result cache keyed by file SHA-256 so identical re-parses are
  free.
- Typed ``DoclingError`` so the Ariba orchestrator can fall back to the vision
  path for recoverable failures instead of silently returning empty pages.
"""

import gc
import hashlib
import io
import logging
import multiprocessing
import os
import re
import ssl
import time
import urllib3
from collections import OrderedDict
from functools import lru_cache
from typing import Any, Dict, List, Optional, Tuple

import requests
import httpx

# Bypass corporate proxy self-signed SSL verification for model weight downloads (requests + httpx / HuggingFace)
try:
    ssl._create_default_https_context = ssl._create_unverified_context
    os.environ["TORCH_COMPILE_DISABLE"] = "1"
    os.environ["TORCHDYNAMO_DISABLE"] = "1"
    os.environ["PYTHONHTTPSVERIFY"] = "0"
    os.environ["CURL_CA_BUNDLE"] = ""
    os.environ["SSL_CERT_FILE"] = ""
    os.environ["REQUESTS_CA_BUNDLE"] = ""
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    _orig_request = requests.Session.request
    def _unverified_request(self, method, url, **kwargs):
        kwargs.setdefault("verify", False)
        return _orig_request(self, method, url, **kwargs)
    requests.Session.request = _unverified_request

    _orig_httpx_client_init = httpx.Client.__init__
    def _unverified_httpx_client_init(self, *args, **kwargs):
        kwargs["verify"] = False
        _orig_httpx_client_init(self, *args, **kwargs)
    httpx.Client.__init__ = _unverified_httpx_client_init

    _orig_httpx_async_client_init = httpx.AsyncClient.__init__
    def _unverified_httpx_async_client_init(self, *args, **kwargs):
        kwargs["verify"] = False
        _orig_httpx_async_client_init(self, *args, **kwargs)
    httpx.AsyncClient.__init__ = _unverified_httpx_async_client_init
except Exception:
    pass

import fitz  # PyMuPDF for cheap native-text detection / PDF classification

from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat, DocumentStream
from docling.datamodel.pipeline_options import (
    PdfPipelineOptions,
    RapidOcrOptions,
    TableFormerMode,
    TableStructureOptions,
    ThreadedPdfPipelineOptions,
)
from docling.datamodel.accelerator_options import AcceleratorDevice, AcceleratorOptions
from docling_core.types.doc.document import ImageRefMode

logger = logging.getLogger(__name__)

# ── CPU / thread tuning ───────────────────────────────────────────────────────
_N_CPU = multiprocessing.cpu_count() or 4
NUM_THREADS = max(1, _N_CPU - 1)  # leave 1 core headroom for the API/event loop

# Align the common BLAS/OpenMP thread pools with our chosen count.
for _env in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS"):
    os.environ.setdefault(_env, str(NUM_THREADS))

# ── Classification / caching knobs ───────────────────────────────────────────
_TEXT_SAMPLE_PAGES = 3      # pages sampled by PyMuPDF to decide native vs scanned
_TEXT_MIN_CHARS = 100       # per sampled page; below this => treated as scanned
_RESULT_CACHE_MAX = 256     # LRU entries (markdown only — bytes are never cached)
_DOCUMENT_TIMEOUT_S = 180.0

# PDFs are converted in page-chunks to keep PyTorch/native RAM bounded on
# ~8 GB hosts (a single-pass 16-page doc OOM'd with std::bad_alloc).
CHUNK_SIZE = 4

# Per-document hard caps (overridable per call)
MAX_PAGES = 20


class DoclingError(Exception):
    """Typed parse failure so callers can route to a fallback.

    Args:
        stage: Which pipeline step failed ("open" | "layout" | "ocr" |
            "table" | "export" | "convert").
        message: Human-readable detail.
        recoverable: True when a fallback path (e.g. vision extraction) may
            still recover the document.
    """

    def __init__(self, stage: str, message: str, recoverable: bool = True):
        self.stage = stage
        self.recoverable = recoverable
        super().__init__(f"[{stage}] {message}")


def _build_threaded_options() -> ThreadedPdfPipelineOptions:
    """Build the fully-configured threaded PDF pipeline.

    A single pipeline (``do_ocr=True``, TableFormer accurate) is used for every
    PDF — the same accuracy profile as the original parser the team relied on.
    ``OcrMode.DEFAULT`` (PDF-aware layout regions) means OCR only runs on
    regions without embedded text, so native-text pages are not OCR'd again.
    A separate "fast" (no-OCR) pipeline was tried for routing, but loading a
    second model set blew past this ~8 GB box's RAM, so it is intentionally
    not used.
    """
    return ThreadedPdfPipelineOptions(
        do_ocr=True,
        do_table_structure=True,
        do_code_enrichment=False,       # certificates: no code blocks
        do_formula_enrichment=False,    # certificates: no math / LaTeX
        images_scale=1.0,               # OCR resolution is governed by ocr_options.scale
        generate_page_images=False,
        generate_picture_images=False,
        generate_parsed_pages=False,    # drop intermediate parsed pages after assembly
        table_structure_options=TableStructureOptions(
            mode=TableFormerMode.ACCURATE,
            do_cell_matching=True,
        ),
        ocr_options=RapidOcrOptions(backend="torch", lang=["en"]),
        accelerator_options=AcceleratorOptions(
            num_threads=NUM_THREADS,
            device=AcceleratorDevice.CPU,
            cuda_use_flash_attention2=False,
        ),
        document_timeout=_DOCUMENT_TIMEOUT_S,
        # Conservative batch sizes keep page-image RAM bounded on ~8 GB hosts.
        ocr_batch_size=4,
        layout_batch_size=4,
        table_batch_size=2,             # tables are RAM-heavy; keep this modest
        batch_polling_interval_seconds=0.25,
        queue_max_size=64,
    )


@lru_cache(maxsize=1)
def _make_converter(kind: str = "full") -> DocumentConverter:
    """Build (and memoize) the Docling DocumentConverter.

    ``kind`` is kept for call-site clarity and future routing, but only the
    "full" (OCR) pipeline is used — see ``_build_threaded_options``. The
    pipeline models load lazily on the first convert.
    """
    opts = _build_threaded_options()
    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(
                pipeline_options=opts,
                # NOTE: the default DoclingParseDocumentBackend is used on purpose —
                # the ThreadedDoclingParseDocumentBackend fails with
                # "Page N failed to parse (backend_failure)" on some real
                # certificates, silently dropping pages.
            ),
        }
    )
    logger.info("Docling converter initialised (threads=%d)", NUM_THREADS)
    return converter


def _get_converter(kind: str = "full") -> DocumentConverter:
    return _make_converter(kind)


def warmup() -> bool:
    """Pre-initialise the Docling pipeline (config only; models load lazily).

    Cheap to call at startup — model weights are downloaded/loaded on the first
    actual conversion, so this just removes config-build time from first use.
    """
    try:
        _make_converter()
        logger.info("Docling converter pre-warmed.")
        return True
    except Exception as e:  # pragma: no cover - defensive
        logger.warning(f"Docling warmup warning: {e}")
        return False


def is_loaded() -> bool:
    """Return True if the Docling converter has been initialised in memory."""
    return _make_converter.cache_info().currsize >= 1


def classify_pdf(file_bytes: bytes, sample_pages: int = _TEXT_SAMPLE_PAGES,
                 min_chars: int = _TEXT_MIN_CHARS) -> bool:
    """Return True when the PDF (or sampled window) is scanned / image-only.

    Uses "any page" semantics: if *any* sampled page has fewer than
    ``min_chars`` of selectable text, the input is treated as scanned so OCR
    runs on it. This catches mixed documents (a text cover letter with scanned
    certificate attachments) which a page-average heuristic would miss. On any
    failure we assume the worst (scanned) so we never silently drop a document.
    """
    try:
        pdf_doc = fitz.open(stream=file_bytes, filetype="pdf")
        for i, page in enumerate(pdf_doc):
            if i >= sample_pages:
                break
            if len((page.get_text() or "").strip()) < min_chars:
                pdf_doc.close()
                return True
        pdf_doc.close()
        return False
    except Exception:
        return True


def _strip_image_artifacts(markdown: str) -> str:
    """Remove embedded data-URI images and image placeholder comments."""
    md = re.sub(r'!\[[^\]]*\]\(data:image/.*?\)', '', markdown)
    md = re.sub(r'<!--\s*(image|🖼️).*?-->', '', md, flags=re.IGNORECASE)
    return md.strip()


def _parse_docling_result(result, start_page_offset: int = 0, max_pages: int = MAX_PAGES) -> List[Dict[str, Any]]:
    """Extract per-page markdown from a Docling ConversionResult.

    Uses ``export_to_markdown(page_no=..., traverse_pictures=True)`` so scanned
    PDFs where OCR text lives under top-level PictureItems are captured too.
    """
    doc = getattr(result, "document", None)
    if doc is None:
        return []

    extracted: List[Dict[str, Any]] = []
    page_nos = sorted(doc.pages) if getattr(doc, "pages", None) else []

    for p_no in page_nos:
        if len(extracted) >= max_pages:
            break
        try:
            p_md = doc.export_to_markdown(
                page_no=p_no,
                image_mode=ImageRefMode.PLACEHOLDER,
                traverse_pictures=True,
            ) or ""
        except Exception:
            p_md = ""
        p_md = _strip_image_artifacts(p_md)
        if p_md:
            extracted.append({"page_number": start_page_offset + p_no, "markdown": p_md})

    if not extracted:
        # Defensive: single doc-level markdown (DOCX/XLSX/HTML/image paths).
        try:
            full = doc.export_to_markdown(traverse_pictures=True) or ""
        except Exception:
            full = ""
        full = _strip_image_artifacts(full)
        if full:
            extracted.append({"page_number": start_page_offset + 1, "markdown": full})

    return extracted


def _error_summary(result) -> str:
    errors = getattr(result, "errors", None) or []
    parts = [e.error_message for e in errors if getattr(e, "error_message", None)]
    return "; ".join(parts) or "unknown error"


def _convert_one(source, converter, max_pages: int) -> Tuple[List[Dict[str, Any]], Any]:
    """Run one Docling conversion and extract per-page markdown.

    Returns ``(pages, result)``. Never raises for a bad document — a failed
    conversion just yields ``([], result)`` so callers can inspect ``result``.
    """
    try:
        result = converter.convert(
            source,
            raises_on_error=False,
            max_num_pages=max_pages,
        )
    except Exception as e:
        raise DoclingError("convert", f"pipeline raised: {e}", recoverable=True) from e
    pages = _parse_docling_result(result, start_page_offset=0, max_pages=max_pages)
    return pages, result


def _result_meta(result) -> Tuple[str, bool, bool]:
    """Best-effort (status, has_ocr, has_tables) from a ConversionResult."""
    status = getattr(result, "status", None)
    has_ocr = False
    has_tables = False
    for page in getattr(result, "pages", []) or []:
        if getattr(page, "has_ocr", False):
            has_ocr = True
        if getattr(page, "has_tables", False):
            has_tables = True
    return (status.value if status else "unknown", has_ocr, has_tables)


def _convert_pdf_chunked(
    file_bytes: bytes,
    filename: str,
    max_pages: int,
    mime_type: str,
    kind: str,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Convert a PDF in bounded page-chunks (memory-safe on ~8 GB hosts).

    A single-pass 16-page document OOM'd (``std::bad_alloc``) because the
    threaded pipeline holds whole pages in memory; chunking bounds that
    footprint while still giving Docling full pages of context. The full
    (OCR) pipeline handles mixed documents — text pages skip OCR automatically
    via ``OcrMode.DEFAULT``, scanned pages get OCR'd.
    """
    converter = _get_converter(kind)
    t0 = time.monotonic()
    all_pages: List[Dict[str, Any]] = []
    status = "success"
    has_ocr = False
    has_tables = False
    tried_fallback = False

    try:
        pdf_doc = fitz.open(stream=file_bytes, filetype="pdf")
        total_pages = len(pdf_doc)
        pages_to_process = min(total_pages, max_pages)

        for start_idx in range(0, pages_to_process, CHUNK_SIZE):
            end_idx = min(start_idx + CHUNK_SIZE, pages_to_process)
            chunk_pdf = fitz.open()
            chunk_pdf.insert_pdf(pdf_doc, from_page=start_idx, to_page=end_idx - 1)
            chunk_bytes = chunk_pdf.write()
            chunk_pdf.close()

            source = DocumentStream(name=f"{filename}_p{start_idx + 1}", stream=io.BytesIO(chunk_bytes))
            chunk_pages, result = _convert_one(source, converter, max_pages=CHUNK_SIZE)

            for p in chunk_pages:
                p["page_number"] += start_idx  # re-base chunk-relative page numbers

            all_pages.extend(chunk_pages)
            c_status, c_ocr, c_tables = _result_meta(result)
            if c_status not in ("success", "partial_success"):
                status = c_status
            has_ocr = has_ocr or c_ocr
            has_tables = has_tables or c_tables

            gc.collect()  # release per-chunk PyTorch/native memory before the next chunk

        pdf_doc.close()
    except DoclingError:
        raise
    except Exception as e:
        # PyMuPDF failed to split (e.g. unusual PDF). Fall back to a single
        # direct pass — if that also fails, DoclingError propagates.
        tried_fallback = True
        logger.warning("Chunked PDF processing failed (%s) — single-pass fallback.", e)
        source = DocumentStream(name=filename, stream=io.BytesIO(file_bytes))
        all_pages, result = _convert_one(source, converter, max_pages=max_pages)
        status, has_ocr, has_tables = _result_meta(result)

    if not all_pages and status not in ("success", "partial_success"):
        raise DoclingError(
            "convert",
            f"{filename}: conversion {status} — no pages extracted",
            recoverable=True,
        )

    elapsed_ms = int((time.monotonic() - t0) * 1000)
    doc_meta: Dict[str, Any] = {
        "filename": filename,
        "page_count": len(all_pages),
        "mime_type": mime_type,
        "pipeline_kind": "chunked",
        "has_ocr": has_ocr,
        "has_tables": has_tables,
        "duration_ms": elapsed_ms,
        "status": status,
        "fallback_single_pass": tried_fallback,
    }
    return all_pages, doc_meta


def _convert_uncached(
    file_bytes: bytes,
    mime_type: str,
    filename: str,
    max_pages: int,
    kind: str,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Run a single Docling conversion for the given pipeline kind.

    PDFs are processed in bounded page-chunks (memory-safe); other formats
    (images, DOCX, XLSX) run as a single pass.
    """
    if mime_type == "application/pdf" or file_bytes[:4] == b"%PDF":
        return _convert_pdf_chunked(file_bytes, filename, max_pages, mime_type, kind)

    converter = _get_converter(kind)
    t0 = time.monotonic()
    source = DocumentStream(name=filename, stream=io.BytesIO(file_bytes))
    pages, result = _convert_one(source, converter, max_pages=max_pages)
    status, has_ocr, has_tables = _result_meta(result)

    if not pages and status not in ("success", "partial_success"):
        raise DoclingError(
            "convert",
            f"{filename}: conversion {status} — {_error_summary(result)}",
            recoverable=True,
        )

    doc_meta: Dict[str, Any] = {
        "filename": filename,
        "page_count": len(pages),
        "mime_type": mime_type,
        "pipeline_kind": kind,
        "has_ocr": has_ocr,
        "has_tables": has_tables,
        "duration_ms": int((time.monotonic() - t0) * 1000),
        "status": status,
    }
    return pages, doc_meta


# ── In-process LRU result cache (markdown only — never the raw bytes) ────────
_result_cache: "OrderedDict[Tuple[Any, ...], Tuple[List[Dict[str, Any]], Dict[str, Any]]]" = OrderedDict()


def _cache_get(key: tuple) -> Optional[Tuple[List[Dict[str, Any]], Dict[str, Any]]]:
    hit = _result_cache.get(key)
    if hit is not None:
        _result_cache.move_to_end(key)
        return hit
    return None


def _cache_put(key: tuple, value: Tuple[List[Dict[str, Any]], Dict[str, Any]]) -> None:
    _result_cache[key] = value
    _result_cache.move_to_end(key)
    while len(_result_cache) > _RESULT_CACHE_MAX:
        _result_cache.popitem(last=False)


def _copy_result(value: Tuple[List[Dict[str, Any]], Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    pages = [dict(p) for p in value[0]]
    meta = dict(value[1])
    return pages, meta


def clear_cache() -> int:
    """Drop all cached parse results (admin / test helper)."""
    n = len(_result_cache)
    _result_cache.clear()
    return n


def parse_to_markdown(
    file_bytes: bytes,
    mime_type: str = "application/pdf",
    filename: str = "document",
    max_pages: int = MAX_PAGES,
) -> Tuple[List[Dict[str, Any]], float, Dict[str, Any]]:
    """Parse supported document bytes to per-page markdown.

    Returns ``(pages, cost_usd, doc_meta)`` where cost is always 0.0 (Docling is
    local). ``pages`` items are ``{"page_number": int, "markdown": str}``.

    The single full (OCR) pipeline is used for all documents — PDFs are split
    into bounded page-chunks for memory safety. Results are cached in-process
    keyed by file SHA-256. Raises ``DoclingError`` for unparseable documents.
    """
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    kind = "full"
    if mime_type != "application/pdf" and file_bytes[:4] != b"%PDF":
        kind = "full"  # images / DOCX / XLSX also use the full pipeline

    cache_key = (file_hash, kind, mime_type, filename, max_pages)
    cached = _cache_get(cache_key)
    if cached is not None:
        pages, doc_meta = _copy_result(cached)
        return pages, 0.0, doc_meta

    pages, doc_meta = _convert_uncached(file_bytes, mime_type, filename, max_pages, kind)

    _cache_put(cache_key, (pages, doc_meta))
    gc.collect()  # keep PyTorch RAM bounded between distinct documents
    return pages, 0.0, doc_meta
