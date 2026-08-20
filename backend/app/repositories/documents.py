"""Repository for document ingestion and page management."""

from typing import List, Optional
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import joinedload
from app.models.tables import Document, DocumentPage, ObjectStorage, DocumentFolder


class FolderRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_all(self) -> List[dict]:
        stmt = (
            select(
                DocumentFolder.id,
                DocumentFolder.name,
                DocumentFolder.created_at,
                func.count(Document.id).label("document_count"),
            )
            .outerjoin(Document, Document.folder_id == DocumentFolder.id)
            .group_by(DocumentFolder.id, DocumentFolder.name, DocumentFolder.created_at)
            .order_by(DocumentFolder.name.asc())
        )
        res = await self.session.execute(stmt)
        return [
            {
                "id": str(r.id),
                "name": r.name,
                "document_count": r.document_count or 0,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in res.all()
        ]

    async def create(self, name: str) -> DocumentFolder:
        folder = DocumentFolder(name=name.strip())
        self.session.add(folder)
        await self.session.commit()
        await self.session.refresh(folder)
        return folder

    async def get_by_name(self, name: str) -> Optional[DocumentFolder]:
        result = await self.session.execute(
            select(DocumentFolder).where(DocumentFolder.name == name.strip())
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, folder_id: UUID) -> Optional[DocumentFolder]:
        result = await self.session.execute(
            select(DocumentFolder).where(DocumentFolder.id == folder_id)
        )
        return result.scalar_one_or_none()

    async def update(self, folder_id: UUID, new_name: str) -> Optional[DocumentFolder]:
        folder = await self.get_by_id(folder_id)
        if folder:
            folder.name = new_name.strip()
            await self.session.commit()
            await self.session.refresh(folder)
        return folder

    async def delete(self, folder_id: UUID) -> bool:
        folder = await self.get_by_id(folder_id)
        if not folder:
            return False
        await self.session.delete(folder)
        await self.session.commit()
        return True


class DocumentRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        title: str,
        object_id: Optional[UUID] = None,
        folder_id: Optional[UUID] = None,
        region: Optional[str] = None,
        input_tokens: int = 0,
        output_tokens: int = 0,
        cost_usd: float = 0.0,
        file_url: Optional[str] = None,
        file_hash: Optional[str] = None,
    ) -> Document:
        from app.services.region_router import detect_document_region
        reg = region or detect_document_region(title)

        doc = Document(
            title=title,
            object_id=object_id,
            folder_id=folder_id,
            region=reg,
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
            select(Document)
            .options(joinedload(Document.object_storage), joinedload(Document.folder))
            .where(Document.id == doc_id)
        )
        return result.scalar_one_or_none()

    async def get_by_hash(self, file_hash: str) -> Optional[Document]:
        result = await self.session.execute(
            select(Document)
            .join(ObjectStorage, Document.object_id == ObjectStorage.id)
            .options(joinedload(Document.object_storage), joinedload(Document.folder))
            .where(ObjectStorage.checksum == file_hash)
        )
        return result.scalar_one_or_none()

    async def list_all(self, limit: int = 100, offset: int = 0) -> List[Document]:
        result = await self.session.execute(
            select(Document)
            .options(joinedload(Document.object_storage), joinedload(Document.folder))
            .order_by(Document.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def move_to_folder(self, doc_id: UUID, folder_id: Optional[UUID]) -> Optional[Document]:
        doc = await self.get_by_id(doc_id)
        if doc:
            doc.folder_id = folder_id
            await self.session.commit()
            await self.session.refresh(doc)
        return doc

    async def update_region(self, doc_id: UUID, region: str) -> Optional[Document]:
        doc = await self.get_by_id(doc_id)
        if doc:
            doc.region = region.upper()
            await self.session.commit()
            await self.session.refresh(doc)
        return doc

    async def get_by_title(self, title: str) -> Optional[Document]:
        result = await self.session.execute(
            select(Document)
            .options(joinedload(Document.object_storage), joinedload(Document.folder))
            .where(Document.title == title)
        )
        return result.scalar_one_or_none()

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

    async def delete_pages_by_document(self, document_id: UUID) -> int:
        from sqlalchemy import delete
        result = await self.session.execute(
            delete(DocumentPage).where(DocumentPage.document_id == document_id)
        )
        await self.session.commit()
        return result.rowcount or 0

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

    async def get_page_by_num(self, document_id: UUID, page_number: int) -> Optional[DocumentPage]:
        result = await self.session.execute(
            select(DocumentPage)
            .where(DocumentPage.document_id == document_id, DocumentPage.page_number == page_number)
        )
        return result.scalar_one_or_none()

    async def upsert_page(
        self,
        document_id: UUID,
        page_number: int,
        content: str,
        embedding: Optional[List[float]] = None,
    ) -> DocumentPage:
        existing = await self.get_page_by_num(document_id, page_number)
        if existing:
            existing.content = content
            existing.embedding = embedding
            await self.session.commit()
            await self.session.refresh(existing)
            return existing
        else:
            return await self.create_page(document_id, page_number, content, embedding)


# Alias for backward compatibility
ChunkRepository = PageRepository
