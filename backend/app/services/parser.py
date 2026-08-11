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

GEMINI_INPUT_RATE = 0.30 / 1_000_000
GEMINI_OUTPUT_RATE = 2.50 / 1_000_000


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

VISION_OCR_PROMPT = (
    "You are an expert Document, Slide, Manual, and UI Form OCR Parser.\n"
    "Transcribe ALL text, workflows, and form fields from this page into clean, RAG-optimized Markdown.\n\n"
    "STRICT NO-NOISE & ANTI-CLUTTER RULES:\n"
    "1. Do NOT output base64 data URIs, SVG code, raw image strings, or fake '![icon](data:...)' tags.\n"
    "2. Ignore decorative icons, company logos (e.g. GAMUDA header logos), corner branding, background graphics, or page watermarks.\n"
    "3. Ignore email headers, timestamps, test email addresses (e.g. <s4system-prod+...>), and email navigation buttons (Reply / Reply All / Forward).\n"
    "4. Do NOT add UI control descriptions like '[ Text Input ]', '[ Dropdown Selection ]', or '(Collapsible section)' for form fields. Only extract the clean field label and its required asterisk (*).\n\n"
    "TEXT, DIAGRAM & FORM EXTRACTION INSTRUCTIONS:\n"
    "1. Workflows & Step Cards: Transcribe multi-column or sequential step cards (e.g. Step 1 | Step 2 | Step 3) sequentially with clear '## Step X' headers, exact descriptions, and clickable link targets [here](#).\n"
    "2. Sample Email Screenshots: Condense sample email screenshots, greetings, and company intro boilerplate into concise '## Step X', key instructions, validity notices (e.g. valid for 30 days), and action links.\n"
    "3. Banners & Callouts: Explicitly transcribe all text inside highlighted/colored boxes, notices, footer banners, and button labels (e.g. 'Register your interest here ->').\n"
    "4. UI Form Screenshots: Extract EVERY SINGLE form field name, label, and required asterisk symbol (*). Keep field numbers (e.g. 5.1 First Name *, 5.4 Office Telephone Number *).\n"
    "5. FAQs & Q&A Pairs: Format each FAQ pair clearly as:\n"
    "   ### Question: <exact question>\n"
    "   **Answer:** <complete answer>\n"
    "6. Be 100% exhaustive with all instructions, steps, rules, and required fields while omitting boilerplate filler text."
)


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
    prompt = VISION_OCR_PROMPT

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

    max_workers = min(20, len(page_tasks))
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
