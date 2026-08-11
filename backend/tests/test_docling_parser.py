"""Tests for Docling Parser Service (Phase 1).

These tests mock ``_convert_uncached`` so no model weights are downloaded or
loaded — they assert routing, caching, error handling and markdown extraction
behaviour. The real pipeline is exercised via ``scripts/dev_parse_sample.py``.
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.modules['google._upb._message'] = None
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

from unittest.mock import MagicMock, patch

import pytest

from app.services import docling_parser


@pytest.fixture(autouse=True)
def _clear_parser_cache():
    """Isolate each test from the module-level LRU result cache."""
    docling_parser.clear_cache()
    yield
    docling_parser.clear_cache()


# ── fixture builders (PyMuPDF, no models) ────────────────────────────────────

def _native_text_pdf() -> bytes:
    import fitz
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "This is a certificate with real selectable text content. " * 10)
    data = doc.tobytes()
    doc.close()
    return data


def _image_only_pdf() -> bytes:
    import fitz
    doc = fitz.open()
    page = doc.new_page()
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 200, 200), False)
    pix.clear_with(255)  # white bitmap — no text layer
    page.insert_image(page.rect, pixmap=pix)
    data = doc.tobytes()
    doc.close()
    return data


def _fake_pages() -> list:
    return [{"page_number": 1, "markdown": "## Title\nSome table data."}]


def _fake_meta(kind: str = "fast") -> dict:
    return {
        "filename": "x.pdf", "page_count": 1, "mime_type": "application/pdf",
        "pipeline_kind": kind, "has_ocr": False, "has_tables": True,
        "duration_ms": 12, "status": "success",
    }


# ── classification ───────────────────────────────────────────────────────────

def test_classify_native_text_pdf_is_not_scanned():
    assert docling_parser.classify_pdf(_native_text_pdf()) is False


def test_classify_image_only_pdf_is_scanned():
    assert docling_parser.classify_pdf(_image_only_pdf()) is True


def test_classify_garbage_pdf_assumes_scanned():
    assert docling_parser.classify_pdf(b"%PDF-1.4 garbage not a real pdf") is True


# ── routing (single full pipeline for all inputs) ────────────────────────────

@patch("app.services.docling_parser._convert_uncached")
def test_native_text_pdf_uses_full_pipeline(mock_convert):
    mock_convert.return_value = (_fake_pages(), _fake_meta("full"))
    pages, cost, meta = docling_parser.parse_to_markdown(
        _native_text_pdf(), mime_type="application/pdf", filename="native.pdf"
    )
    assert meta["pipeline_kind"] == "full"
    assert mock_convert.call_args.args[4] == "full"
    assert cost == 0.0


@patch("app.services.docling_parser._convert_uncached")
def test_scanned_pdf_uses_full_pipeline(mock_convert):
    mock_convert.return_value = (_fake_pages(), _fake_meta("full"))
    pages, cost, meta = docling_parser.parse_to_markdown(
        _image_only_pdf(), mime_type="application/pdf", filename="scan.pdf"
    )
    assert meta["pipeline_kind"] == "full"
    assert mock_convert.call_args.args[4] == "full"


@patch("app.services.docling_parser._convert_uncached")
def test_non_pdf_uses_full_pipeline(mock_convert):
    mock_convert.return_value = (_fake_pages(), _fake_meta("full"))
    pages, cost, meta = docling_parser.parse_to_markdown(
        b"fake image bytes", mime_type="image/png", filename="img.png"
    )
    assert meta["pipeline_kind"] == "full"


# ── caching ──────────────────────────────────────────────────────────────────

@patch("app.services.docling_parser._convert_uncached")
def test_result_cache_hit_on_identical_bytes(mock_convert):
    mock_convert.return_value = (_fake_pages(), _fake_meta("fast"))
    data = _native_text_pdf()
    docling_parser.parse_to_markdown(data, mime_type="application/pdf", filename="a.pdf")
    docling_parser.parse_to_markdown(data, mime_type="application/pdf", filename="a.pdf")
    assert mock_convert.call_count == 1  # second call served from cache


@patch("app.services.docling_parser._convert_uncached")
def test_cache_miss_for_different_bytes(mock_convert):
    mock_convert.return_value = (_fake_pages(), _fake_meta("fast"))
    docling_parser.parse_to_markdown(_native_text_pdf(), mime_type="application/pdf")
    docling_parser.parse_to_markdown(_image_only_pdf(), mime_type="application/pdf")
    assert mock_convert.call_count == 2


def test_clear_cache():
    assert docling_parser.clear_cache() == 0
    with patch("app.services.docling_parser._convert_uncached") as mock_convert:
        mock_convert.return_value = (_fake_pages(), _fake_meta("fast"))
        docling_parser.parse_to_markdown(_native_text_pdf(), mime_type="application/pdf")
        assert docling_parser.clear_cache() == 1


# ── errors ───────────────────────────────────────────────────────────────────

@patch("app.services.docling_parser._convert_uncached")
def test_docling_error_is_raised_on_failure(mock_convert):
    mock_convert.side_effect = docling_parser.DoclingError(
        "convert", "conversion failure — boom", recoverable=True
    )
    with pytest.raises(docling_parser.DoclingError) as exc_info:
        docling_parser.parse_to_markdown(b"%PDF garbage", mime_type="application/pdf")
    assert exc_info.value.stage == "convert"
    assert exc_info.value.recoverable is True


# ── markdown extraction ──────────────────────────────────────────────────────

class _FakeDoc:
    pages = {1: object(), 2: object()}

    def export_to_markdown(self, page_no=None, **kwargs):
        if page_no is not None:
            return f"page-{page_no}-markdown"
        return "full-document-markdown"


class _FakeResult:
    def __init__(self, document=None):
        self.document = document


def test_parse_docling_result_per_page():
    pages = docling_parser._parse_docling_result(_FakeResult(_FakeDoc()), max_pages=20)
    assert pages == [
        {"page_number": 1, "markdown": "page-1-markdown"},
        {"page_number": 2, "markdown": "page-2-markdown"},
    ]


def test_parse_docling_result_respects_max_pages():
    pages = docling_parser._parse_docling_result(_FakeResult(_FakeDoc()), max_pages=1)
    assert len(pages) == 1


def test_parse_docling_result_falls_back_to_full_doc():
    class DocWithNoPages(_FakeDoc):
        pages = {}

    pages = docling_parser._parse_docling_result(_FakeResult(DocWithNoPages()), max_pages=20)
    assert pages == [{"page_number": 1, "markdown": "full-document-markdown"}]


def test_parse_docling_result_none_document():
    assert docling_parser._parse_docling_result(_FakeResult(None), max_pages=20) == []


# ── markdown cleanup ─────────────────────────────────────────────────────────

def test_strip_image_artifacts():
    md = "Hello ![](data:image/png;base64,AAAA) world\n![Image](data:image/jpeg;base64,BBBB)\n<!-- image -->\nTEXT"
    cleaned = docling_parser._strip_image_artifacts(md)
    assert "data:image" not in cleaned
    assert "<!-- image -->" not in cleaned
    assert "TEXT" in cleaned


# ── warmup / loaded ──────────────────────────────────────────────────────────

def test_warmup_initialises_pipeline():
    docling_parser._make_converter.cache_clear()
    assert docling_parser.warmup() is True
    assert docling_parser.is_loaded() is True
