"""Document ingestion orchestrator for Hybrid Page RAG.

Flow: hash -> (skip if exists) -> upload -> parse -> chunk pages -> embed pages -> insert document_pages.
Runs blocking HTTP/CPU work in threads so it can be awaited from async routes.
"""

import asyncio
import hashlib
import logging
from typing import Optional
from uuid import UUID

from app.db.session import get_session_factory
from app.repositories.documents import DocumentRepository, PageRepository
from app.services import chunker, embeddings, parser, storage

logger = logging.getLogger(__name__)


class IngestResult:
    def __init__(self, document_id: Optional[UUID], title: str, status: str,
                 page_count: int = 0, cost_usd: float = 0.0, message: str = ""):
        self.document_id = document_id
        self.title = title
        self.status = status          # "created" | "skipped" | "failed"
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
) -> IngestResult:
    file_hash = _compute_hash(file_bytes)

    # Idempotency: skip if already ingested by hash
    factory = get_session_factory()
    async with factory() as session:
        doc_repo = DocumentRepository(session)
        existing = await doc_repo.get_by_hash(file_hash)
        if existing:
            return IngestResult(
                document_id=existing.id, title=title, status="skipped",
                message="File already ingested (same SHA-256).",
            )

        # Upload
        file_url = await storage.store_and_record(file_bytes, "manuals", filename, content_type)
        if not file_url:
            return IngestResult(None, title, "failed", message="Upload failed.")

        # Parse (blocking HTTP/CPU → thread)
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

        # Insert Document and DocumentPage rows
        doc = await doc_repo.create(
            title=title,
            file_url=file_url,
            file_hash=file_hash,
            input_tokens=in_t,
            output_tokens=out_t,
            cost_usd=parse_cost,
        )
        page_repo = PageRepository(session)

        for p_chunk, p_emb in zip(page_chunks, page_embeddings):
            await page_repo.create_page(
                document_id=doc.id,
                page_number=p_chunk["page_number"],
                content=p_chunk["content"],
                embedding=p_emb,
            )

        counts = await page_repo.count_by_document(doc.id)
        return IngestResult(
            document_id=doc.id, title=title, status="created",
            page_count=counts["page_count"],
            cost_usd=parse_cost,
        )


async def ingest_document(
    file_bytes: bytes,
    title: str,
    filename: str,
    content_type: str,
) -> IngestResult:
    return await _ingest_blocking(file_bytes, title, filename, content_type)
