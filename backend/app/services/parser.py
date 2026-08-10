"""PDF → Markdown parser using Gemini Multimodal Vision OCR (Parallelized).

Primary: Renders PDF pages to high-resolution PNG images and calls Gemini 3.5 Flash Vision
in parallel threads to extract selectable text, screenshot form fields, required asterisk (*) inputs,
button callouts, and diagrams into rich Markdown.

Fallback: PyMuPDF local text extraction so the pipeline works offline.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
import logging
from typing import List, Tuple

from app.config import settings

logger = logging.getLogger(__name__)

MAX_PAGES = 200  # generous cap for manuals

GEMINI_INPUT_RATE = 0.10 / 1_000_000
GEMINI_OUTPUT_RATE = 0.40 / 1_000_000


def _pyMuPDF_pages(file_bytes: bytes) -> List[dict]:
    """Extract selectable text per page via PyMuPDF (offline fallback)."""
    try:
        import fitz
    except ImportError:  # pragma: no cover
        return []
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception:
        return []
    pages = []
    try:
        for i, page in enumerate(doc):
            text = page.get_text().strip()
            if text:
                pages.append({"page_number": i + 1, "text": text})
    except Exception as e:
        logger.error("PyMuPDF fallback parse failed: %s", e)
    finally:
        doc.close()
    return pages


def _parse_single_page_vision(client, model: str, prompt: str, png_bytes: bytes, page_num: int, raw_text: str, types_module) -> Tuple[int, str, int, int]:
    """Parse 1 page image with Gemini Flash Vision."""
    try:
        response = client.models.generate_content(
            model=model,
            contents=[
                prompt,
                types_module.Part.from_bytes(data=png_bytes, mime_type="image/png"),
            ],
        )
        text = response.text.strip() if response.text else ""
        if not text:
            text = raw_text

        in_tok = 0
        out_tok = 0
        um = getattr(response, "usage_metadata", None)
        if um:
            in_tok = getattr(um, "prompt_token_count", 0) or 0
            out_tok = getattr(um, "candidates_token_count", 0) or 0

        return page_num, text, in_tok, out_tok
    except Exception as err:
        logger.error(f"Gemini vision parse failed on page {page_num}: {err}")
        return page_num, raw_text, 0, 0


def _parse_pdf_with_gemini_vision(file_bytes: bytes) -> Tuple[List[dict], int, int, float]:
    """Render PDF pages to PNG images and call Gemini Flash Vision in parallel threads."""
    try:
        import fitz
        from google import genai
        from google.genai import types
    except ImportError as e:
        logger.warning(f"Vision OCR dependency missing ({e}) — falling back to PyMuPDF text.")
        return _pyMuPDF_pages(file_bytes), 0, 0, 0.0

    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as e:
        logger.error(f"PyMuPDF open failed: {e}")
        return [], 0, 0, 0.0

    client = genai.Client(api_key=settings.gemini_api_key)
    prompt = (
        "You are an expert Document, Slide, and UI Form OCR Parser.\n"
        "Transcribe ALL content from this page/slide into detailed, structured Markdown.\n\n"
        "CRITICAL INSTRUCTIONS FOR IMAGES & SCREENSHOTS:\n"
        "1. If the page contains a form, screenshot, UI panel, or diagram:\n"
        "   - Extract and list EVERY SINGLE form field name, label, asterisk required symbol (*), input placeholder, and dropdown selection option visible in the screenshot.\n"
        "   - Group form fields clearly (e.g., 'Form Fields in Screenshot: Registered Company Name *, Registration Number e.g. * (Malaysia: SSM..., Australia: ABN...), Primary Contact (First Name *, Last Name *, Designation *)...').\n"
        "2. Transcribe all text boxes, step descriptions, arrows, callouts, and button instructions.\n"
        "3. Do NOT summarize or skip any form fields. Be 100% exhaustive so all form requirements are searchable."
    )

    page_tasks = []
    for i, page in enumerate(doc):
        if i >= MAX_PAGES:
            break
        page_num = i + 1
        try:
            pix = page.get_pixmap(dpi=150)
            png_bytes = pix.tobytes("png")
            raw_text = page.get_text().strip()
            page_tasks.append((page_num, png_bytes, raw_text))
        except Exception as pe:
            logger.error(f"Failed rendering page {page_num}: {pe}")

    doc.close()

    if not page_tasks:
        return [], 0, 0, 0.0

    parsed_map = {}
    total_in = 0
    total_out = 0

    max_workers = min(10, len(page_tasks))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(
                _parse_single_page_vision,
                client,
                settings.gemini_chat_model,
                prompt,
                png_bytes,
                p_num,
                raw_txt,
                types,
            )
            for p_num, png_bytes, raw_txt in page_tasks
        ]
        for f in as_completed(futures):
            p_num, text, in_tok, out_tok = f.result()
            if text:
                parsed_map[p_num] = text
            total_in += in_tok
            total_out += out_tok

    pages = [{"page_number": p, "text": parsed_map[p]} for p in sorted(parsed_map.keys())]
    cost = (total_in * GEMINI_INPUT_RATE) + (total_out * GEMINI_OUTPUT_RATE)
    return pages, total_in, total_out, cost


def parse_pdf_to_markdown(file_bytes: bytes) -> Tuple[List[dict], int, int, float]:
    """Parse a PDF into per-page markdown blocks.

    Uses Gemini 3.5 Flash Vision OCR in parallel threads when GEMINI_API_KEY is present,
    else falls back to PyMuPDF local text extraction.
    """
    if settings.gemini_api_key:
        return _parse_pdf_with_gemini_vision(file_bytes)
    else:
        logger.warning("GEMINI_API_KEY not set — using PyMuPDF text fallback.")
        return _pyMuPDF_pages(file_bytes), 0, 0, 0.0
