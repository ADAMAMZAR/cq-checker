"""Page-level and Markdown-smart chunking for Hybrid Page RAG.

Supports:
1. PDF page-level chunking.
2. Smart Markdown chunking by Q&A pairs, Mermaid diagram sections, and header blocks.
"""

import re
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


def _split_markdown_by_qa(markdown_text: str) -> List[str]:
    """Split markdown text into distinct Q&A / Template pairs with section category headers."""
    header_regex = re.compile(r'^(?=(?:#{1,3}\s+))', re.MULTILINE)
    parts = header_regex.split(markdown_text)

    cleaned_chunks = []
    active_section_header = ""

    for part in parts:
        clean_part = re.sub(r'^---\s*', '', part.strip(), flags=re.MULTILINE).strip()
        if not clean_part:
            continue

        lines = clean_part.split('\n')
        first_line = lines[0] if lines else ""

        if re.match(r'^#\s+', first_line) and not re.search(r'Q\d+:', first_line, re.IGNORECASE):
            active_section_header = first_line.strip()
            clean_part = '\n'.join(lines[1:]).strip()

        clean_part = re.sub(r'---\s*#\s+.*$', '', clean_part, flags=re.DOTALL).strip()
        clean_part = re.sub(r'\n#\s+[^#\n]+$', '', clean_part, flags=re.DOTALL).strip()

        if not clean_part:
            continue

        block_content = clean_part
        if active_section_header and not block_content.startswith(active_section_header):
            block_content = f"{active_section_header}\n\n{block_content}"

        cleaned_chunks.append(block_content)

    return cleaned_chunks if cleaned_chunks else [markdown_text.strip()]


def _split_markdown_by_headers(markdown_text: str) -> List[str]:
    """Split markdown text by #, ##, ### headers or --- dividers."""
    # Split on headers (#, ##, ###) or horizontal rules (---)
    header_regex = re.compile(
        r'^(?=(?:#{1,3}\s+|---+\s*$))',
        re.MULTILINE
    )
    sections = header_regex.split(markdown_text)
    cleaned = [s.strip() for s in sections if s and s.strip() and s.strip() != '---']
    return cleaned


def chunk_markdown_document(markdown_text: str, max_chunk_tokens: int = 1200) -> List[dict]:
    """Smartly chunk a Markdown document for RAG ingestion.

    1. Preserves Q&A pairs (Question + Answer in 1 chunk).
    2. Keeps Mermaid code blocks together with their step list narratives.
    3. Splits narrative sections by Markdown headers (###, ##, #).
    """
    if not markdown_text or not markdown_text.strip():
        return []

    # First split by major structural headers (H1, H2, H3, or ---)
    major_sections = _split_markdown_by_headers(markdown_text)
    raw_chunks = []

    for section in major_sections:
        # Check if this section contains multiple Q&A pairs
        qa_pairs = _split_markdown_by_qa(section)
        if len(qa_pairs) > 1:
            for pair in qa_pairs:
                raw_chunks.append(pair)
        else:
            raw_chunks.append(section)

    final_chunks = []
    chunk_index = 1

    for chunk_text in raw_chunks:
        # If chunk contains Mermaid block, ensure it stays whole unless excessively large
        has_mermaid = "```mermaid" in chunk_text

        tokens = estimate_tokens(chunk_text)
        if tokens <= max_chunk_tokens or has_mermaid:
            final_chunks.append({
                "page_number": chunk_index,
                "content": chunk_text,
            })
            chunk_index += 1
        else:
            # Fallback: split long non-mermaid sections by paragraph breaks
            paragraphs = [p.strip() for p in chunk_text.split("\n\n") if p.strip()]
            current_buf = []
            current_tokens = 0

            for p in paragraphs:
                p_tok = estimate_tokens(p)
                if current_tokens + p_tok > max_chunk_tokens and current_buf:
                    combined = "\n\n".join(current_buf)
                    final_chunks.append({
                        "page_number": chunk_index,
                        "content": combined,
                    })
                    chunk_index += 1
                    current_buf = [p]
                    current_tokens = p_tok
                else:
                    current_buf.append(p)
                    current_tokens += p_tok

            if current_buf:
                combined = "\n\n".join(current_buf)
                final_chunks.append({
                    "page_number": chunk_index,
                    "content": combined,
                })
                chunk_index += 1

    return final_chunks
