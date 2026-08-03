"""Tests for the PDF -> image rendering helper."""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.modules['google._upb._message'] = None
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

from app.services import pdf


def _make_mini_pdf() -> bytes:
    """Build a tiny 1-page PDF using PyMuPDF."""
    import fitz
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Test Certificate")
    data = doc.tobytes()
    doc.close()
    return data


def test_pdf_to_images_renders_pages():
    data = _make_mini_pdf()
    images = pdf.pdf_to_images(data)
    assert len(images) == 1
    assert images[0][:2] == b"\xff\xd8"  # JPEG magic


def test_pdf_to_data_urls():
    data = _make_mini_pdf()
    urls = pdf.pdf_to_data_urls(data)
    assert len(urls) == 1
    assert urls[0].startswith("data:image/jpeg;base64,")


def test_pdf_max_pages_cap():
    import fitz
    doc = fitz.open()
    for _ in range(3):
        doc.new_page()
    data = doc.tobytes()
    doc.close()
    urls = pdf.pdf_to_data_urls(data, max_pages=2)
    assert len(urls) == 2


def test_pdf_invalid_bytes_returns_empty():
    assert pdf.pdf_to_images(b"not a pdf") == []


def test_image_to_data_url():
    url = pdf.image_to_data_url(b"\xff\xd8\xff")
    assert url.startswith("data:image/jpeg;base64,")


def test_is_pdf():
    assert pdf.is_pdf("application/pdf") is True
    assert pdf.is_pdf(None, "cert.pdf") is True
    assert pdf.is_pdf("image/png") is False
    assert pdf.is_pdf(None, "cert.png") is False
