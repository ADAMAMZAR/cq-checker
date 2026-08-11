"""Repository for document ingestion and page management."""

from typing import List, Optional
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import joinedload
from app.models.tables import Document, DocumentPage, ObjectStorage


class DocumentRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        title: str,
        object_id: Optional[UUID] = None,
        input_tokens: int = 0,
        output_tokens: int = 0,
        cost_usd: float = 0.0,
        file_url: Optional[str] = None,
        file_hash: Optional[str] = None,
    ) -> Document:
        doc = Document(
            title=title,
            object_id=object_id,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=round(float(cost_usd), 6),
        )
        self.session.add(doc)
        await self.session.commit()
        await self.session.refresh(doc)
        return doc

    async def get_by_id(self, doc_id: UUID) -> Optional[Document]:
        result = await self.session.execute(
            select(Document).options(joinedload(Document.object_storage)).where(Document.id == doc_id)
        )
        return result.scalar_one_or_none()

    async def get_by_hash(self, file_hash: str) -> Optional[Document]:
        result = await self.session.execute(
            select(Document)
            .join(ObjectStorage, Document.object_id == ObjectStorage.id)
            .options(joinedload(Document.object_storage))
            .where(ObjectStorage.checksum == file_hash)
        )
        return result.scalar_one_or_none()

    async def list_all(self, limit: int = 50, offset: int = 0) -> List[Document]:
        result = await self.session.execute(
            select(Document)
            .options(joinedload(Document.object_storage))
            .order_by(Document.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def exists_by_url(self, file_url: str) -> bool:
        result = await self.session.execute(
            select(func.count(Document.id))
            .join(ObjectStorage, Document.object_id == ObjectStorage.id)
            .where(ObjectStorage.file_url == file_url)
        )
        return result.scalar() > 0


class PageRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_page(
        self,
        document_id: UUID,
        page_number: int,
        content: str,
        embedding: Optional[List[float]] = None,
    ) -> DocumentPage:
        page = DocumentPage(
            document_id=document_id,
            page_number=page_number,
            content=content,
            embedding=embedding,
        )
        self.session.add(page)
        await self.session.commit()
        await self.session.refresh(page)
        return page

    async def list_pages(self, document_id: UUID) -> List[DocumentPage]:
        result = await self.session.execute(
            select(DocumentPage)
            .where(DocumentPage.document_id == document_id)
            .order_by(DocumentPage.page_number.asc())
        )
        return list(result.scalars().all())

    async def count_by_document(self, document_id: UUID) -> dict:
        page_count = await self.session.execute(
            select(func.count(DocumentPage.id)).where(DocumentPage.document_id == document_id)
        )
        return {
            "page_count": page_count.scalar() or 0,
        }


# Alias for backward compatibility
ChunkRepository = PageRepository
