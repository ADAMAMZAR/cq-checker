"""PDF rendering helpers.

Converts PDF pages into JPEG images so multimodal models (DeepSeek V4 Flash)
can read them. Handles both native text+image PDFs and full-image scans by
rendering every page to a raster image.
"""

import base64
import logging
from typing import List, Optional

logger = logging.getLogger(__name__)

MAX_PAGES = 10          # bound cost: at most 10 pages per document
DPI = 200               # good balance of OCR legibility and size
JPEG_QUALITY = 85


def pdf_to_images(
    file_bytes: bytes,
    max_pages: int = MAX_PAGES,
    dpi: int = DPI,
) -> List[bytes]:
    """Render each page of a PDF to JPEG bytes.

    Returns a list of JPEG byte blobs (one per page), capped at `max_pages`.
    Returns an empty list if the input is not a parseable PDF.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError as e:  # pragma: no cover
        logger.error("PyMuPDF not installed: %s", e)
        return []

    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as e:
        logger.error("Failed to open PDF: %s", e)
        return []

    images: List[bytes] = []
    try:
        for page in doc:
            if len(images) >= max_pages:
                logger.warning("PDF exceeds %d pages — truncating.", max_pages)
                break
            pix = page.get_pixmap(dpi=dpi)
            images.append(pix.tobytes("jpeg", jpg_quality=JPEG_QUALITY))
    except Exception as e:
        logger.error("Failed to render PDF page: %s", e)
    finally:
        doc.close()
    return images


def image_to_data_url(image_bytes: bytes, mime_type: str = "image/jpeg") -> str:
    """Return a base64 data URL suitable for an OpenAI-compatible image_url."""
    b64 = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{mime_type};base64,{b64}"


def pdf_to_data_urls(
    file_bytes: bytes,
    max_pages: int = MAX_PAGES,
    dpi: int = DPI,
) -> List[str]:
    """Render a PDF to a list of data URLs (one per page)."""
    images = pdf_to_images(file_bytes, max_pages=max_pages, dpi=dpi)
    return [image_to_data_url(img) for img in images]


def is_pdf(mime_type: Optional[str], filename: Optional[str] = None) -> bool:
    if mime_type and mime_type.lower() == "application/pdf":
        return True
    if filename and filename.lower().endswith(".pdf"):
        return True
    return False
