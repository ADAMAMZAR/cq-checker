"""Repository for object-storage metadata records."""

from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tables import ObjectStorage


class ObjectStorageRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        file_url: str,
        bucket: Optional[str] = None,
        object_key: Optional[str] = None,
        content_type: Optional[str] = None,
        size_bytes: Optional[int] = None,
        checksum: Optional[str] = None,
    ) -> ObjectStorage:
        record = ObjectStorage(
            file_url=file_url,
            bucket=bucket,
            object_key=object_key,
            content_type=content_type,
            size_bytes=size_bytes,
            checksum=checksum,
        )
        self.session.add(record)
        await self.session.commit()
        await self.session.refresh(record)
        return record

    async def get_by_url(self, file_url: str) -> Optional[ObjectStorage]:
        result = await self.session.execute(
            select(ObjectStorage).where(ObjectStorage.file_url == file_url)
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, record_id: UUID) -> Optional[ObjectStorage]:
        result = await self.session.execute(
            select(ObjectStorage).where(ObjectStorage.id == record_id)
        )
        return result.scalar_one_or_none()
