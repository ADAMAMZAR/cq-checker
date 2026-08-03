"""PDF → Markdown parser.

Primary: calls MiniMax M3 to convert a PDF into structured Markdown with
page tracking. Fallback: local PyMuPDF text extraction (page.get_text()) so the
pipeline works without a MiniMax key and never hard-fails.
"""

import logging
from typing import List, Optional, Tuple

import requests

from app.config import settings

logger = logging.getLogger(__name__)

MAX_PAGES = 200  # generous cap for manuals

# MiniMax pricing (approx, USD per 1M tokens)
INPUT_RATE = 0.20 / 1_000_000
OUTPUT_RATE = 1.00 / 1_000_000


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


def parse_pdf_to_markdown(file_bytes: bytes) -> Tuple[List[dict], int, int, float]:
    """Parse a PDF into per-page markdown blocks.

    Returns (pages, in_tokens, out_tokens, cost). Each page:
        {"page_number": int, "text": str}
    """
    if not settings.minimax_api_key:
        logger.warning("MINIMAX_API_KEY not set — using PyMuPDF text fallback.")
        return _pyMuPDF_pages(file_bytes), 0, 0, 0.0

    try:
        import base64
        b64 = base64.b64encode(file_bytes).decode("ascii")

        url = settings.minimax_base_url.rstrip("/") + "/v1/text/chatcompletion_v2"
        headers = {
            "Authorization": f"Bearer {settings.minimax_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": settings.minimax_model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "file",
                            "file": b64,
                            "file_type": "pdf",
                        },
                        {
                            "type": "text",
                            "text": (
                                "Convert this PDF document into clean Markdown. "
                                "Preserve tables, headings, and structure. "
                                "Prefix each page's content with a line: <!-- PAGE N --> "
                                "where N is the page number."
                            ),
                        },
                    ],
                }
            ],
            "temperature": 0,
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=120)
        resp.raise_for_status()
        body = resp.json()

        content = body["choices"][0]["message"]["content"]
        usage = body.get("usage", {})
        in_tokens = int(usage.get("total_tokens", 0))
        out_tokens = 0
        cost = calculate_cost(in_tokens, out_tokens)

        pages = _split_markdown_by_page(content)
        return pages, in_tokens, out_tokens, cost
    except Exception as e:
        logger.error(f"MiniMax parse failed ({e}) — using PyMuPDF text fallback.")
        return _pyMuPDF_pages(file_bytes), 0, 0, 0.0


def _split_markdown_by_page(markdown: str) -> List[dict]:
    """Split a MiniMax markdown response into per-page blocks."""
    import re
    pages: List[dict] = []
    blocks = re.split(r"<!--\s*PAGE\s+(\d+)\s*-->", markdown)
    # blocks = [pre, pageno, content, pageno, content, ...]
    if len(blocks) < 2:
        # No page markers — treat whole doc as page 1
        if markdown.strip():
            return [{"page_number": 1, "text": markdown.strip()}]
        return []
    i = 1
    while i + 1 < len(blocks):
        page_no = int(blocks[i])
        text = blocks[i + 1].strip()
        if text:
            pages.append({"page_number": page_no, "text": text})
        i += 2
    return pages


def calculate_cost(prompt_tokens: int, output_tokens: int,
                   input_rate: float = INPUT_RATE,
                   output_rate: float = OUTPUT_RATE) -> float:
    return (prompt_tokens * input_rate) + (output_tokens * output_rate)
