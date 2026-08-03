"""Tests for the PDF -> Markdown parser (MiniMax + PyMuPDF fallback)."""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.modules['google._upb._message'] = None
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

from unittest.mock import MagicMock, patch
from app.services import parser


def _make_mini_pdf() -> bytes:
    import fitz
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Test manual page one")
    doc.new_page()
    doc.close()
    # rebuild with text on second page too
    doc = fitz.open()
    p1 = doc.new_page()
    p1.insert_text((72, 72), "Page one content here")
    p2 = doc.new_page()
    p2.insert_text((72, 72), "Page two content here")
    data = doc.tobytes()
    doc.close()
    return data


def test_pymupdf_fallback_without_minimax_key():
    with patch("app.config.settings.minimax_api_key", ""):
        pages, in_t, out_t, cost = parser.parse_pdf_to_markdown(_make_mini_pdf())
    assert len(pages) == 2
    assert pages[0]["page_number"] == 1
    assert "Page one" in pages[0]["text"]
    assert pages[1]["page_number"] == 2
    assert in_t == 0


def test_minimax_success_splits_by_page():
    mock_resp = MagicMock()
    mock_resp.raise_for_status.return_value = None
    mock_resp.json.return_value = {
        "choices": [{"message": {"content": (
            "<!-- PAGE 1 -->\n# Intro\nSome content.\n\n"
            "<!-- PAGE 2 -->\n# Chapter 2\nMore content here."
        )}}],
        "usage": {"total_tokens": 1500},
    }
    with patch("app.config.settings.minimax_api_key", "mm-test"):
        with patch("requests.post", return_value=mock_resp):
            pages, in_t, out_t, cost = parser.parse_pdf_to_markdown(b"%PDF-fake")
    assert len(pages) == 2
    assert pages[0]["page_number"] == 1
    assert "Intro" in pages[0]["text"]
    assert pages[1]["page_number"] == 2
    assert in_t == 1500


def test_minimax_failure_falls_back_to_pymupdf():
    mock_resp = MagicMock()
    mock_resp.raise_for_status.side_effect = Exception("MiniMax down")
    with patch("app.config.settings.minimax_api_key", "mm-test"):
        with patch("requests.post", return_value=mock_resp):
            pages, _, _, _ = parser.parse_pdf_to_markdown(_make_mini_pdf())
    assert len(pages) == 2  # PyMuPDF fallback


def test_split_markdown_by_page_no_markers():
    pages = parser._split_markdown_by_page("Just some plain markdown.")
    assert len(pages) == 1
    assert pages[0]["page_number"] == 1
