"""Document ingestion orchestrator for Hybrid Page RAG.

Flow: hash -> (skip if exists) -> upload -> parse -> chunk pages -> embed pages -> insert document_pages.
Runs blocking HTTP/CPU work in threads so it can be awaited from async routes.
"""

import asyncio
import hashlib
import logging
from typing import Optional
from uuid import UUID

from app.config import settings
from app.db.session import get_session_factory
from app.repositories.documents import DocumentRepository, PageRepository
from app.services import chunker, embeddings, parser, storage

logger = logging.getLogger(__name__)


class IngestResult:
    def __init__(self, document_id: Optional[UUID], title: str, status: str,
                 page_count: int = 0, cost_usd: float = 0.0, message: str = ""):
        self.document_id = document_id
        self.title = title
        self.status = status # "created" | "skipped" | "failed"
        self.page_count = page_count
        self.cost_usd = cost_usd
        self.message = message

    @property
    def parent_count(self) -> int:
        """Backward compatibility for legacy serializers."""
        return self.page_count

    @property
    def child_count(self) -> int:
        """Backward compatibility for legacy serializers."""
        return self.page_count

    def to_dict(self) -> dict:
        return {
            "document_id": str(self.document_id) if self.document_id else None,
            "title": self.title,
            "status": self.status,
            "page_count": self.page_count,
            "parent_count": self.page_count,
            "child_count": self.page_count,
            "cost_usd": round(self.cost_usd, 6),
            "message": self.message,
        }


def _compute_hash(file_bytes: bytes) -> str:
    return hashlib.sha256(file_bytes).hexdigest()


async def _ingest_blocking(
    file_bytes: bytes,
    title: str,
    filename: str,
    content_type: str,
    overwrite: bool = True,
) -> IngestResult:
    file_hash = _compute_hash(file_bytes)

    factory = get_session_factory()
    async with factory() as session:
        doc_repo = DocumentRepository(session)
        page_repo = PageRepository(session)

        # Check existing by hash or title
        existing = await doc_repo.get_by_hash(file_hash)
        if not existing:
            existing = await doc_repo.get_by_title(title)

        if existing and not overwrite:
            return IngestResult(
                document_id=existing.id, title=title, status="skipped",
                message="File already ingested.",
            )

        # Upload
        file_url, object_id = await storage.store_and_record(file_bytes, "manuals", filename, content_type)
        if not file_url:
            return IngestResult(None, title, "failed", message="Upload failed.")

        is_markdown = (
            (content_type and content_type.lower() in ("text/markdown", "text/x-markdown", "text/plain")) or
            filename.lower().endswith((".md", ".markdown", ".txt"))
        )

        if is_markdown:
            raw_text = file_bytes.decode("utf-8", errors="replace")
            page_chunks = await asyncio.to_thread(chunker.chunk_markdown_document, raw_text)
            in_t, out_t, parse_cost = 0, 0, 0.0
            if not page_chunks:
                return IngestResult(None, title, "failed", message="Markdown parsing produced no content.")
        else:
            # Parse PDF (blocking HTTP/CPU → thread)
            pages, in_t, out_t, parse_cost = await asyncio.to_thread(
                parser.parse_pdf_to_markdown, file_bytes,
            )
            if not pages:
                return IngestResult(None, title, "failed", message="No parseable text found.")

            # Chunk into page objects (pure CPU → thread)
            page_chunks = await asyncio.to_thread(chunker.chunk_pages, pages)
            if not page_chunks:
                return IngestResult(None, title, "failed", message="Page chunking produced no content.")

        # Embed full page texts (blocking HTTP → thread)
        page_texts = [p["content"] for p in page_chunks]
        page_embeddings = await asyncio.to_thread(embeddings.embed_texts, page_texts)
        if len(page_embeddings) != len(page_texts):
            return IngestResult(None, title, "failed", message="Embedding count mismatch.")

        if existing and overwrite:
            # Delete old pages & update document row
            await page_repo.delete_pages_by_document(existing.id)
            existing.object_id = object_id
            existing.input_tokens = in_t
            existing.output_tokens = out_t
            existing.cost_usd = round(float(parse_cost), 6)
            await session.commit()
            doc = existing
            status = "updated"
        else:
            # Insert new Document row
            doc = await doc_repo.create(
                title=title,
                object_id=object_id,
                input_tokens=in_t,
                output_tokens=out_t,
                cost_usd=parse_cost,
            )
            status = "created"

        for p_chunk, p_emb in zip(page_chunks, page_embeddings):
            await page_repo.create_page(
                document_id=doc.id,
                page_number=p_chunk["page_number"],
                content=p_chunk["content"],
                embedding=p_emb,
            )

        counts = await page_repo.count_by_document(doc.id)
        return IngestResult(
            document_id=doc.id, title=title, status=status,
            page_count=counts["page_count"],
            cost_usd=parse_cost,
            message=f"Document {status} with {counts['page_count']} page(s).",
        )


async def ingest_document(
    file_bytes: bytes,
    title: str,
    filename: str,
    content_type: str,
    overwrite: bool = True,
) -> IngestResult:
    return await _ingest_blocking(file_bytes, title, filename, content_type, overwrite=overwrite)


async def bulk_ingest_documents(
    items: List[dict],
    overwrite: bool = True,
) -> List[IngestResult]:
    results = []
    for item in items:
        res = await _ingest_blocking(
            file_bytes=item["file_bytes"],
            title=item.get("title") or item["filename"],
            filename=item["filename"],
            content_type=item.get("content_type", "application/pdf"),
            overwrite=overwrite,
        )
        results.append(res)
    return results


async def test_ingest_document(
    file_bytes: bytes,
    filename: str,
    title: Optional[str] = None,
    mode: str = "single",
    page_number: int = 1,
) -> dict:
    """Run Vision OCR on a document or specific page WITHOUT saving to database."""
    import fitz
    from google import genai
    from google.genai import types

    doc_title = title or filename
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    total_pages = len(doc)
    doc.close()

    if mode == "single":
        target_pages = [max(1, min(page_number, total_pages))]
    else:
        target_pages = list(range(1, min(total_pages, parser.MAX_PAGES) + 1))

    def _parse_pages():
        d = fitz.open(stream=file_bytes, filetype="pdf")
        client = genai.Client(api_key=settings.gemini_api_key)
        prompt = parser.VISION_OCR_PROMPT
        tasks = []
        for p_num in target_pages:
            p_idx = p_num - 1
            if 0 <= p_idx < len(d):
                page = d[p_idx]
                pix = page.get_pixmap(dpi=150)
                png_bytes = pix.tobytes("png")
                raw_text = page.get_text().strip()
                tasks.append((p_num, png_bytes, raw_text))
        d.close()

        results = []
        total_in = 0
        total_out = 0
        for p_num, png_bytes, raw_txt in tasks:
            _, text, in_tok, out_tok = parser._parse_single_page_vision(
                client, settings.gemini_chat_model, prompt, png_bytes, p_num, raw_txt, types
            )
            total_in += in_tok
            total_out += out_tok
            cost = (in_tok * parser.GEMINI_INPUT_RATE) + (out_tok * parser.GEMINI_OUTPUT_RATE)
            results.append({
                "page_number": p_num,
                "markdown": text,
                "in_tokens": in_tok,
                "out_tokens": out_tok,
                "cost_usd": round(cost, 6),
            })
        total_cost = (total_in * parser.GEMINI_INPUT_RATE) + (total_out * parser.GEMINI_OUTPUT_RATE)
        return results, total_in, total_out, round(total_cost, 6)

    parsed_results, total_in, total_out, total_cost = await asyncio.to_thread(_parse_pages)

    factory = get_session_factory()
    async with factory() as session:
        doc_repo = DocumentRepository(session)
        page_repo = PageRepository(session)
        file_hash = _compute_hash(file_bytes)
        existing_doc = await doc_repo.get_by_hash(file_hash)
        if not existing_doc:
            all_docs = await doc_repo.list_all(limit=500)
            existing_doc = next((d for d in all_docs if d.title == doc_title), None)

        for res in parsed_results:
            p_num = res["page_number"]
            res["exists_in_db"] = False
            res["db_content_preview"] = None
            if existing_doc:
                existing_page = await page_repo.get_page_by_num(existing_doc.id, p_num)
                if existing_page:
                    res["exists_in_db"] = True
                    res["db_content_preview"] = (existing_page.content or "")[:200]

    return {
        "filename": filename,
        "title": doc_title,
        "total_pdf_pages": total_pages,
        "mode": mode,
        "results": parsed_results,
        "total_in_tokens": total_in,
        "total_out_tokens": total_out,
        "total_cost_usd": total_cost,
    }


async def commit_ingest_pages(
    filename: str,
    title: str,
    pages: List[dict],
    file_bytes: Optional[bytes] = None,
) -> dict:
    """Commit/overwrite specific tested pages into PostgreSQL with gemini-embedding-2 vectors."""
    factory = get_session_factory()
    async with factory() as session:
        doc_repo = DocumentRepository(session)
        page_repo = PageRepository(session)

        doc = None
        if file_bytes:
            file_hash = _compute_hash(file_bytes)
            doc = await doc_repo.get_by_hash(file_hash)
        if not doc:
            all_docs = await doc_repo.list_all(limit=500)
            doc = next((d for d in all_docs if d.title == title or d.title == filename), None)

        if not doc:
            object_id = None
            if file_bytes:
                _, object_id = await storage.store_and_record(file_bytes, "manuals", filename, "application/pdf")
            doc = await doc_repo.create(title=title or filename, object_id=object_id)

        committed_pages = []
        for p in pages:
            p_num = int(p["page_number"])
            md_text = p["markdown"]
            emb_vector = await asyncio.to_thread(embeddings.embed_text, md_text)
            await page_repo.upsert_page(doc.id, p_num, md_text, emb_vector)
            committed_pages.append(p_num)

        return {
            "status": "committed",
            "document_id": str(doc.id),
            "document_title": doc.title,
            "committed_pages": committed_pages,
            "message": f"Successfully committed {len(committed_pages)} page(s) to database (Document ID: {doc.id}).",
        }
