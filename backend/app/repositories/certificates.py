"""Repository for certificate verification records."""

from typing import List, Optional
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tables import CertificateVerification


class CertificateRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        file_url: str,
        extracted_data: dict,
        status: str,
        reasoning_trace: Optional[str] = None,
        file_hash: Optional[str] = None,
    ) -> CertificateVerification:
        record = CertificateVerification(
            file_url=file_url,
            file_hash=file_hash,
            extracted_data=extracted_data,
            status=status,
            reasoning_trace=reasoning_trace,
        )
        self.session.add(record)
        await self.session.commit()
        await self.session.refresh(record)
        return record

    async def get_by_id(self, record_id: UUID) -> Optional[CertificateVerification]:
        result = await self.session.execute(
            select(CertificateVerification).where(CertificateVerification.id == record_id)
        )
        return result.scalar_one_or_none()

    async def get_by_hash(self, file_hash: str) -> Optional[CertificateVerification]:
        """Return the most recent verification for a file SHA-256 hash (if any)."""
        result = await self.session.execute(
            select(CertificateVerification)
            .where(CertificateVerification.file_hash == file_hash)
            .order_by(CertificateVerification.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def list_all(self, limit: int = 50, offset: int = 0) -> List[CertificateVerification]:
        result = await self.session.execute(
            select(CertificateVerification)
            .order_by(CertificateVerification.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def count_by_status(self, status: str) -> int:
        result = await self.session.execute(
            select(func.count(CertificateVerification.id)).where(CertificateVerification.status == status)
        )
        return result.scalar() or 0
