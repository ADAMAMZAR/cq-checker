"""Unit tests for Docling Parser Service (Phase 1)."""

import pytest
from app.services import docling_parser


def test_docling_warmup():
    """Verify pre-warmup function executes without error."""
    success = docling_parser.warmup()
    assert success is True
    assert docling_parser.is_loaded() is True


def test_docling_parse_dummy_text():
    """Verify parse_to_markdown converts simple PDF/text bytes into structured page dicts."""
    # Dummy bytes representation
    dummy_bytes = b"%PDF-1.4 sample content"
    pages, cost, meta = docling_parser.parse_to_markdown(
        dummy_bytes, mime_type="application/pdf", filename="sample.pdf"
    )

    assert isinstance(pages, list)
    assert cost == 0.0
    assert meta["filename"] == "sample.pdf"
    assert "page_count" in meta
