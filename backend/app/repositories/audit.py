"""Repository for legacy audit logs, suppliers, and document evidence."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tables import Supplier, AuditLog, DocumentEvidence


def _to_timestamp(value) -> object:
    """Coerce legacy string timestamps to datetimes for timestamptz columns."""
    from app.services.audit_data import _to_db_timestamp
    return _to_db_timestamp(value)


def _coerce_ts(value):
    if not isinstance(value, datetime):
        return _to_timestamp(value)
    return value


class SupplierRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_or_create(self, supplier_name: str) -> Supplier:
        result = await self.session.execute(
            select(Supplier).where(Supplier.supplier_name == supplier_name)
        )
        existing = result.scalar_one_or_none()
        if existing:
            return existing
        supplier = Supplier(supplier_name=supplier_name)
        self.session.add(supplier)
        await self.session.commit()
        await self.session.refresh(supplier)
        return supplier

    async def list_all(self) -> List[Supplier]:
        result = await self.session.execute(select(Supplier).order_by(Supplier.supplier_name))
        return list(result.scalars().all())


class AuditLogRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, log: AuditLog) -> AuditLog:
        log.timestamp = _coerce_ts(log.timestamp)
        self.session.add(log)
        await self.session.commit()
        await self.session.refresh(log)
        return log

    async def get_by_id(self, audit_id: UUID) -> Optional[AuditLog]:
        result = await self.session.execute(
            select(AuditLog).where(AuditLog.id == audit_id)
        )
        return result.scalar_one_or_none()

    async def get_by_audit_id(self, audit_id: str) -> Optional[AuditLog]:
        result = await self.session.execute(
            select(AuditLog).where(AuditLog.audit_id == audit_id)
        )
        return result.scalar_one_or_none()

    async def list_all(self, limit: int = 100, offset: int = 0) -> List[AuditLog]:
        result = await self.session.execute(
            select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)
        )
        return list(result.scalars().all())


class DocumentEvidenceRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, evidence: DocumentEvidence) -> DocumentEvidence:
        evidence.timestamp = _coerce_ts(evidence.timestamp)
        self.session.add(evidence)
        await self.session.commit()
        await self.session.refresh(evidence)
        return evidence

    async def get_by_audit_id(self, audit_id: str) -> List[DocumentEvidence]:
        result = await self.session.execute(
            select(DocumentEvidence).where(DocumentEvidence.audit_id == audit_id)
        )
        return list(result.scalars().all())

    async def get_by_filename(self, audit_id: str, filename: str) -> Optional[DocumentEvidence]:
        result = await self.session.execute(
            select(DocumentEvidence).where(
                DocumentEvidence.audit_id == audit_id,
                DocumentEvidence.filename == filename,
            )
        )
        return result.scalar_one_or_none()

    async def list_all(self, limit: int = 100, offset: int = 0) -> List[DocumentEvidence]:
        result = await self.session.execute(
            select(DocumentEvidence).order_by(DocumentEvidence.timestamp.desc()).limit(limit).offset(offset)
        )
        return list(result.scalars().all())
