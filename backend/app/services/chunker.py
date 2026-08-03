"""Parent–child chunking for RAG.

- Parent chunk: ~800–1000 tokens (full paragraph/table context)
- Child chunk:  ~200 tokens (vectorized for granular search)

Uses a ~4 chars/token heuristic (no external tokenizer dependency). Pages are
preserved on every parent chunk; children inherit the parent's page.
"""

import re
from typing import List

PARENT_MIN_TOKENS = 600
PARENT_MAX_TOKENS = 1000
CHILD_MAX_TOKENS = 200
CHARS_PER_TOKEN = 4.0


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, int(len(text) / CHARS_PER_TOKEN))


def _split_sentences(text: str) -> List[str]:
    """Split text into sentence-like units, keeping whitespace."""
    if not text:
        return []
    parts = re.split(r"(?<=[.!?])\s+|\n+", text)
    return [p.strip() for p in parts if p.strip()]


def chunk_into_parents(page_number: int, text: str) -> List[dict]:
    """Split one page's markdown into parent chunks (each ~600–1000 tokens).

    Returns [{"page_number": int, "content": str}].
    """
    if not text or not text.strip():
        return []

    sentences = _split_sentences(text)
    parents: List[dict] = []
    current: List[str] = []
    current_tokens = 0

    for sent in sentences:
        sent_tokens = estimate_tokens(sent)
        if current and current_tokens + sent_tokens > PARENT_MAX_TOKENS:
            parents.append({
                "page_number": page_number,
                "content": " ".join(current).strip(),
            })
            current = []
            current_tokens = 0
        current.append(sent)
        current_tokens += sent_tokens

    if current:
        parents.append({
            "page_number": page_number,
            "content": " ".join(current).strip(),
        })

    # Merge undersized parents into neighbours to avoid tiny chunks
    merged = _merge_small_parents(parents)
    return merged


def _merge_small_parents(parents: List[dict]) -> List[dict]:
    if not parents:
        return []
    merged: List[dict] = []
    for parent in parents:
        if merged and estimate_tokens(parent["content"]) < PARENT_MIN_TOKENS:
            merged[-1]["content"] = (merged[-1]["content"] + "\n\n" + parent["content"]).strip()
            continue
        merged.append(dict(parent))
    return merged


def split_parent(parent_content: str) -> List[str]:
    """Split a parent chunk into child chunks of ~200 tokens.

    Returns a list of child content strings.
    """
    if not parent_content:
        return []
    tokens = estimate_tokens(parent_content)
    if tokens <= CHILD_MAX_TOKENS:
        return [parent_content.strip()]

    # Slice by sentence boundaries into ~200-token windows
    sentences = _split_sentences(parent_content)
    children: List[str] = []
    current: List[str] = []
    current_tokens = 0

    for sent in sentences:
        sent_tokens = estimate_tokens(sent)
        if current and current_tokens + sent_tokens > CHILD_MAX_TOKENS:
            children.append(" ".join(current).strip())
            current = []
            current_tokens = 0
        current.append(sent)
        current_tokens += sent_tokens

    if current:
        children.append(" ".join(current).strip())

    return [c for c in children if c]
