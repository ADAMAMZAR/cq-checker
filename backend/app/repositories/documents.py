"""Repository for document ingestion and chunk management."""

from typing import List, Optional
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.tables import Document, ParentChunk, ChildChunk


class DocumentRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, title: str, file_url: str) -> Document:
        doc = Document(title=title, file_url=file_url)
        self.session.add(doc)
        await self.session.commit()
        await self.session.refresh(doc)
        return doc

    async def get_by_id(self, doc_id: UUID) -> Optional[Document]:
        result = await self.session.execute(
            select(Document).where(Document.id == doc_id)
        )
        return result.scalar_one_or_none()

    async def list_all(self, limit: int = 50, offset: int = 0) -> List[Document]:
        result = await self.session.execute(
            select(Document).order_by(Document.created_at.desc()).limit(limit).offset(offset)
        )
        return list(result.scalars().all())

    async def exists_by_url(self, file_url: str) -> bool:
        result = await self.session.execute(
            select(func.count(Document.id)).where(Document.file_url == file_url)
        )
        return result.scalar() > 0


class ChunkRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_parent(self, document_id: UUID, content: str, page_number: Optional[int] = None) -> ParentChunk:
        chunk = ParentChunk(document_id=document_id, content=content, page_number=page_number)
        self.session.add(chunk)
        await self.session.commit()
        await self.session.refresh(chunk)
        return chunk

    async def create_child(self, parent_id: UUID, content: str, embedding: Optional[List[float]] = None) -> ChildChunk:
        chunk = ChildChunk(parent_id=parent_id, content=content, embedding=embedding)
        self.session.add(chunk)
        await self.session.commit()
        await self.session.refresh(chunk)
        return chunk

    async def get_parent_with_children(self, parent_id: UUID) -> Optional[ParentChunk]:
        result = await self.session.execute(
            select(ParentChunk)
            .options(selectinload(ParentChunk.child_chunks))
            .where(ParentChunk.id == parent_id)
        )
        return result.scalar_one_or_none()

    async def count_by_document(self, document_id: UUID) -> dict:
        parent_count = await self.session.execute(
            select(func.count(ParentChunk.id)).where(ParentChunk.document_id == document_id)
        )
        child_count = await self.session.execute(
            select(func.count(ChildChunk.id))
            .join(ParentChunk, ChildChunk.parent_id == ParentChunk.id)
            .where(ParentChunk.document_id == document_id)
        )
        return {
            "parent_chunks": parent_count.scalar(),
            "child_chunks": child_count.scalar(),
        }
