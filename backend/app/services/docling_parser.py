"""Docling Parser Service (IBM Open-Source OCR & Markdown Pipeline).

Provides local single-pass layout analysis, RapidOCR, table structure extraction,
and per-page markdown generation for PDFs, images, DOCX, and XLSX files.
"""

import io
import os
import ssl
import logging
import gc
import fitz  # PyMuPDF for zero-copy PDF page chunking
import requests
import httpx
import urllib3
from typing import List, Dict, Any, Tuple

# Bypass corporate proxy self-signed SSL verification for model weight downloads (requests + httpx / HuggingFace)
try:
    ssl._create_default_https_context = ssl._create_unverified_context
    os.environ["TORCH_COMPILE_DISABLE"] = "1"
    os.environ["TORCHDYNAMO_DISABLE"] = "1"
    os.environ["OMP_NUM_THREADS"] = "4"
    os.environ["MKL_NUM_THREADS"] = "4"
    os.environ["OPENBLAS_NUM_THREADS"] = "4"
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

from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat, DocumentStream
from docling.datamodel.pipeline_options import PdfPipelineOptions, RapidOcrOptions

logger = logging.getLogger(__name__)

# Full Docling Neural Pipeline (Layout Detection + TableFormer + RapidOCR)
_PIPELINE_OPTS = PdfPipelineOptions(
    do_ocr=True,
    do_table_structure=True,
    images_scale=1.0,
    generate_page_images=False,
    generate_picture_images=False,  # Disables heavy Base64 image encoding for speed & token efficiency
    ocr_options=RapidOcrOptions(backend="torch", force_full_page_ocr=False),
)

_converter: DocumentConverter | None = None
CHUNK_SIZE = 3  # Batch size in pages to keep PyTorch RAM bounded under 300MB


def _get_converter() -> DocumentConverter:
    global _converter
    if _converter is None:
        logger.info("Initializing Docling DocumentConverter instance...")
        _converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=_PIPELINE_OPTS),
            }
        )
    return _converter


def warmup() -> bool:
    """Pre-warm the Docling DocumentConverter instance (model weights & layout pipeline)."""
    try:
        conv = _get_converter()
        logger.info("Docling DocumentConverter pre-warmed successfully.")
        return conv is not None
    except Exception as e:
        logger.warning(f"Docling warmup warning: {e}")
        return False


def is_loaded() -> bool:
    """Return True if Docling converter has been initialized in memory."""
    return _converter is not None


def _parse_docling_result(result, start_page_offset: int, max_pages: int) -> List[Dict[str, Any]]:
    """Helper to extract per-page markdown items from a Docling result."""
    import re
    doc = result.document
    extracted_pages: List[Dict[str, Any]] = []
    page_md_dict: Dict[int, List[str]] = {}

    if doc and hasattr(doc, "iterate_items"):
        for item, _level in doc.iterate_items():
            page_no_rel = 1
            if hasattr(item, "prov") and item.prov:
                page_no_rel = item.prov[0].page_no

            actual_page_no = start_page_offset + page_no_rel

            chunk = ""
            if hasattr(item, "export_to_markdown"):
                try:
                    chunk = item.export_to_markdown(doc=doc)
                except Exception:
                    chunk = getattr(item, "text", str(item))
            elif hasattr(item, "text"):
                chunk = item.text

            if chunk and chunk.strip():
                page_md_dict.setdefault(actual_page_no, []).append(chunk.strip())

    if page_md_dict:
        sorted_page_nos = sorted(page_md_dict.keys())
        for p_num in sorted_page_nos:
            if len(extracted_pages) >= max_pages:
                break
            p_text = "\n\n".join(page_md_dict[p_num])
            # Strip Base64 image tags and placeholder comments
            p_text = re.sub(r'!\[Image\]\(data:image/.*?\)', '', p_text)
            p_text = re.sub(r'<!--\s*🖼️.*-->', '', p_text).strip()
            if p_text:
                extracted_pages.append({"page_number": p_num, "markdown": p_text})

    if not extracted_pages and doc and hasattr(doc, "export_to_markdown"):
        full_md = doc.export_to_markdown() or ""
        if full_md.strip():
            extracted_pages.append({"page_number": start_page_offset + 1, "markdown": full_md.strip()})

    return extracted_pages


def parse_to_markdown(
    file_bytes: bytes,
    mime_type: str = "application/pdf",
    filename: str = "document",
    max_pages: int = 20,
) -> Tuple[List[Dict[str, Any]], float, Dict[str, Any]]:
    """Parse supported document bytes to per-page markdown using Chunked Docling Batching.

    Processes multi-page PDFs in 3-page batches with PyTorch memory garbage collection
    between chunks to maintain <300MB RAM usage and prevent std::bad_alloc crashes.
    """
    converter = _get_converter()
    pages: List[Dict[str, Any]] = []

    if mime_type == "application/pdf":
        try:
            pdf_doc = fitz.open(stream=file_bytes, filetype="pdf")
            total_pdf_pages = len(pdf_doc)
            pages_to_process = min(total_pdf_pages, max_pages)

            for start_idx in range(0, pages_to_process, CHUNK_SIZE):
                end_idx = min(start_idx + CHUNK_SIZE, pages_to_process)
                
                # Extract 3-page PDF chunk
                chunk_pdf = fitz.open()
                chunk_pdf.insert_pdf(pdf_doc, from_page=start_idx, to_page=end_idx - 1)
                chunk_bytes = chunk_pdf.write()
                chunk_pdf.close()

                source = DocumentStream(name=f"{filename}_p{start_idx+1}", stream=io.BytesIO(chunk_bytes))
                result = converter.convert(source, raises_on_error=False)

                chunk_pages = _parse_docling_result(result, start_page_offset=start_idx, max_pages=CHUNK_SIZE)
                pages.extend(chunk_pages)

                # Reset PyTorch RAM between batches
                gc.collect()

            pdf_doc.close()
        except Exception as pdf_err:
            logger.warning(f"Chunked PDF processing failed, falling back to direct parse: {pdf_err}")
            source = DocumentStream(name=filename, stream=io.BytesIO(file_bytes))
            result = converter.convert(source, raises_on_error=False)
            pages = _parse_docling_result(result, start_page_offset=0, max_pages=max_pages)
    else:
        source = DocumentStream(name=filename, stream=io.BytesIO(file_bytes))
        result = converter.convert(source, raises_on_error=False)
        pages = _parse_docling_result(result, start_page_offset=0, max_pages=max_pages)

    doc_meta = {
        "filename": filename,
        "page_count": len(pages),
        "mime_type": mime_type,
        "has_ocr": True,
    }

    return pages, 0.0, doc_meta
