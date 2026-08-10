"""Page-level chunking for Hybrid Page RAG.

Treats each PDF page as a single self-contained chunk to preserve visual
callout context, button instructions, and diagram descriptions.
"""

from typing import List, Optional

CHARS_PER_TOKEN = 4.0


def estimate_tokens(text: str) -> int:
    """Estimate token count based on ~4 chars/token heuristic."""
    if not text:
        return 0
    return max(1, int(len(text) / CHARS_PER_TOKEN))


def chunk_page(page_number: int, text: str) -> Optional[dict]:
    """Format one page's text into a single page chunk dict.

    Returns {"page_number": int, "content": str} or None if page is empty.
    """
    if not text or not text.strip():
        return None
    return {
        "page_number": page_number,
        "content": text.strip(),
    }


def chunk_pages(pages: List[dict]) -> List[dict]:
    """Process a list of parsed pages [{"page_number": int, "text": str}] into page chunks.

    Returns [{"page_number": int, "content": str}].
    """
    chunks = []
    for page in pages:
        p_num = page.get("page_number", 1)
        p_text = page.get("text", "")
        c = chunk_page(p_num, p_text)
        if c:
            chunks.append(c)
    return chunks
