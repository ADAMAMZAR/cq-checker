"""PDF → Markdown parser using Gemini Multimodal Vision OCR.

Primary: Renders PDF pages to high-resolution PNG images and calls Gemini 3.5 Flash Vision
to extract selectable text, screenshot form fields, required asterisk (*) inputs,
button callouts, and diagrams into rich Markdown.

Fallback: PyMuPDF local text extraction so the pipeline works offline.
"""

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


def _parse_pdf_with_gemini_vision(file_bytes: bytes) -> Tuple[List[dict], int, int, float]:
    """Render each PDF page to a PNG image and call Gemini Flash Vision to extract

    all text, UI form fields, screenshot labels, asterisk required marks (*), and step instructions.
    """
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
    pages = []
    total_in = 0
    total_out = 0

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

    for i, page in enumerate(doc):
        if i >= MAX_PAGES:
            break
        page_num = i + 1
        try:
            pix = page.get_pixmap(dpi=150)
            png_bytes = pix.tobytes("png")

            response = client.models.generate_content(
                model=settings.gemini_chat_model,
                contents=[
                    prompt,
                    types.Part.from_bytes(data=png_bytes, mime_type="image/png"),
                ],
            )
            text = response.text.strip() if response.text else ""
            if not text:
                text = page.get_text().strip()

            if text:
                pages.append({"page_number": page_num, "text": text})

            um = getattr(response, "usage_metadata", None)
            if um:
                total_in += getattr(um, "prompt_token_count", 0) or 0
                total_out += getattr(um, "candidates_token_count", 0) or 0
        except Exception as err:
            logger.error(f"Gemini vision parse failed on page {page_num}: {err}")
            raw_text = page.get_text().strip()
            if raw_text:
                pages.append({"page_number": page_num, "text": raw_text})

    doc.close()
    cost = (total_in * GEMINI_INPUT_RATE) + (total_out * GEMINI_OUTPUT_RATE)
    return pages, total_in, total_out, cost


def parse_pdf_to_markdown(file_bytes: bytes) -> Tuple[List[dict], int, int, float]:
    """Parse a PDF into per-page markdown blocks.

    Uses Gemini 3.5 Flash Vision OCR when GEMINI_API_KEY is present,
    else falls back to PyMuPDF local text extraction.
    """
    if settings.gemini_api_key:
        return _parse_pdf_with_gemini_vision(file_bytes)
    else:
        logger.warning("GEMINI_API_KEY not set — using PyMuPDF text fallback.")
        return _pyMuPDF_pages(file_bytes), 0, 0, 0.0
