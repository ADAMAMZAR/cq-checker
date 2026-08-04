"""Document ingestion orchestrator.

Flow: hash -> (skip if exists) -> upload -> parse -> chunk -> embed -> insert.
Runs blocking HTTP/CPU work in threads so it can be awaited from async routes.
"""

import asyncio
import hashlib
import logging
from typing import Optional
from uuid import UUID

from app.db.session import get_session_factory
from app.repositories.documents import DocumentRepository, ChunkRepository
from app.services import chunker, embeddings, parser, storage

logger = logging.getLogger(__name__)


class IngestResult:
    def __init__(self, document_id: Optional[UUID], title: str, status: str,
                 parent_count: int = 0, child_count: int = 0,
                 cost_usd: float = 0.0, message: str = ""):
        self.document_id = document_id
        self.title = title
        self.status = status          # "created" | "skipped" | "failed"
        self.parent_count = parent_count
        self.child_count = child_count
        self.cost_usd = cost_usd
        self.message = message

    def to_dict(self) -> dict:
        return {
            "document_id": str(self.document_id) if self.document_id else None,
            "title": self.title,
            "status": self.status,
            "parent_count": self.parent_count,
            "child_count": self.child_count,
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
        pages, _, _, parse_cost = await asyncio.to_thread(
            parser.parse_pdf_to_markdown, file_bytes,
        )
        if not pages:
            return IngestResult(None, title, "failed", message="No parseable text found.")

        # Chunk (pure CPU → thread)
        parents = await asyncio.to_thread(_chunk_pages, pages)
        if not parents:
            return IngestResult(None, title, "failed", message="Chunking produced no parents.")

        # Embed children (blocking HTTP → thread)
        child_texts = [c for parent in parents for c in parent["children"]]
        child_embeddings = await asyncio.to_thread(embeddings.embed_texts, child_texts)
        if len(child_embeddings) != len(child_texts):
            return IngestResult(None, title, "failed", message="Embedding count mismatch.")

        # Insert
        doc = await doc_repo.create(title=title, file_url=file_url, file_hash=file_hash)
        chunk_repo = ChunkRepository(session)

        child_index = 0
        for parent in parents:
            page_number = parent.get("page_number")
            parent_content = parent["content"]
            children = parent["children"]
            parent_row = await chunk_repo.create_parent(doc.id, parent_content, page_number)
            for child_text in children:
                embedding = child_embeddings[child_index]
                child_index += 1
                await chunk_repo.create_child(parent_row.id, child_text, embedding)

        counts = await chunk_repo.count_by_document(doc.id)
        return IngestResult(
            document_id=doc.id, title=title, status="created",
            parent_count=counts["parent_chunks"],
            child_count=counts["child_chunks"],
            cost_usd=parse_cost,
        )


def _chunk_pages(pages: list) -> list:
    """pages: [{"page_number", "text"}]. Returns [{"page_number", "content", "children"}].

    Each parent dict carries its children so embedding order matches insert order.
    """
    result = []
    for page in pages:
        parents = chunker.chunk_into_parents(page.get("page_number", 1), page.get("text", ""))
        for parent in parents:
            children = chunker.split_parent(parent["content"])
            result.append({
                "page_number": parent["page_number"],
                "content": parent["content"],
                "children": children,
            })
    return result


async def ingest_document(
    file_bytes: bytes,
    title: str,
    filename: str,
    content_type: str,
) -> IngestResult:
    return await _ingest_blocking(file_bytes, title, filename, content_type)
