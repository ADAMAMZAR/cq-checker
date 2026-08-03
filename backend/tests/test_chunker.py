"""Tests for parent-child chunking."""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.modules['google._upb._message'] = None
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

from app.services import chunker


def test_estimate_tokens():
    assert chunker.estimate_tokens("x" * 400) == 100
    assert chunker.estimate_tokens("") == 0


def test_single_small_parent():
    parents = chunker.chunk_into_parents(1, "This is a short page.")
    assert len(parents) == 1
    assert parents[0]["page_number"] == 1
    assert parents[0]["content"] != ""


def test_long_text_splits_into_multiple_parents():
    # 200 sentences x 40 chars = 8000 chars -> ~2000 tokens -> multiple parents
    text = " ".join(f"Sentence number {i} with enough words to be meaningful." for i in range(200))
    parents = chunker.chunk_into_parents(3, text)
    assert len(parents) >= 2
    for p in parents:
        assert p["page_number"] == 3
        # Parents may exceed PARENT_MAX_TOKENS slightly after merging small ones
        assert chunker.estimate_tokens(p["content"]) <= chunker.PARENT_MAX_TOKENS * 2


def test_empty_text_no_parents():
    assert chunker.chunk_into_parents(1, "") == []
    assert chunker.chunk_into_parents(1, "   ") == []


def test_split_parent_small_returns_one_child():
    children = chunker.split_parent("Short parent content.")
    assert len(children) == 1


def test_split_parent_large_returns_multiple_children():
    content = " ".join(f"Word group {i} repeated tokens." for i in range(300))
    children = chunker.split_parent(content)
    assert len(children) >= 2
    for c in children:
        assert chunker.estimate_tokens(c) <= chunker.CHILD_MAX_TOKENS + 50


def test_merge_small_parents():
    parents = [
        {"page_number": 1, "content": "tiny a"},
        {"page_number": 1, "content": "tiny b"},
        {"page_number": 1, "content": "x" * 3000},  # large
    ]
    merged = chunker._merge_small_parents(parents)
    assert len(merged) == 2
