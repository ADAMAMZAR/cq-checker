import json
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from app.db.session import get_session_factory
from app.models.tables import AuditLog, DocumentEvidence as NeonDocumentEvidence
from app.repositories.supplier_audit import DocumentEvidenceRepository
from app.schemas import DocumentEvidence, DocumentEvidenceSummary
from app.services.audit_data.serializers import _display_timestamp, _to_document_evidence


async def get_document_evidence_summary(
    audit_id: Optional[str] = None,
    supplier_name: Optional[str] = None,
    supplier_id: Optional[int] = None,
) -> List[DocumentEvidenceSummary]:
    factory = get_session_factory()
    async with factory() as session:
        stmt = select(
            NeonDocumentEvidence.id,
            NeonDocumentEvidence.audit_id,
            NeonDocumentEvidence.supplier_id,
            NeonDocumentEvidence.supplier_name,
            NeonDocumentEvidence.filename,
            NeonDocumentEvidence.ariba_question_label,
            NeonDocumentEvidence.gemini_extracted_supplier_name,
            NeonDocumentEvidence.created_at,
        )
        if audit_id:
            stmt = stmt.where(NeonDocumentEvidence.audit_id == audit_id)
        if supplier_id:
            stmt = stmt.where(NeonDocumentEvidence.supplier_id == supplier_id)
        if supplier_name:
            stmt = stmt.where(func.lower(NeonDocumentEvidence.supplier_name).like(f"%{supplier_name.lower()}%"))

        result = await session.execute(stmt)
        rows = result.all()

    return [
        DocumentEvidenceSummary(
            id=str(r.id),
            audit_id=r.audit_id,
            supplier_id=r.supplier_id,
            supplier_name=r.supplier_name or "",
            filename=r.filename,
            ariba_question_label=r.ariba_question_label,
            gemini_extracted_supplier_name=r.gemini_extracted_supplier_name or "",
            created_at=_display_timestamp(r.created_at),
            timestamp=_display_timestamp(r.created_at),
        )
        for r in rows
    ]


async def get_document_evidence_by_id(document_id: str) -> Optional[DocumentEvidence]:
    factory = get_session_factory()
    async with factory() as session:
        stmt = (
            select(NeonDocumentEvidence)
            .options(joinedload(NeonDocumentEvidence.supplier), joinedload(NeonDocumentEvidence.object_storage))
        )
        try:
            doc_uuid = uuid.UUID(document_id)
            stmt = stmt.where(NeonDocumentEvidence.id == doc_uuid)
        except ValueError:
            stmt = stmt.where(NeonDocumentEvidence.audit_id == document_id)

        result = await session.execute(stmt.limit(1))
        record = result.scalars().first()

    if not record:
        return None
    return _to_document_evidence(record)


async def get_document_evidence_logs(
    audit_id: Optional[str] = None,
    supplier_name: Optional[str] = None,
) -> List[DocumentEvidence]:
    """Optimized SQL query for document evidence logs."""
    factory = get_session_factory()
    async with factory() as session:
        stmt = select(NeonDocumentEvidence)
        if audit_id:
            stmt = stmt.where(NeonDocumentEvidence.audit_id == audit_id)
        if supplier_name:
            stmt = stmt.where(func.lower(NeonDocumentEvidence.supplier_name).like(f"%{supplier_name.lower()}%"))

        res = await session.execute(stmt.limit(100000))
        records = res.scalars().all()

    return [_to_document_evidence(r) for r in records]


async def update_document_evidence(audit_id: str, filename: str, updated_metadata: dict) -> bool:
    factory = get_session_factory()
    async with factory() as session:
        result = await session.execute(
            select(NeonDocumentEvidence).where(
                NeonDocumentEvidence.audit_id == audit_id,
                NeonDocumentEvidence.filename == filename,
            )
        )
        records = result.scalars().all()
        if not records:
            return False

        certs = updated_metadata.get("certificates") if isinstance(updated_metadata, dict) else None
        first = certs[0] if isinstance(certs, list) and certs else updated_metadata
        owner = first.get("certificateOwnerName") if isinstance(first, dict) else None
        for record in records:
            record.gemini_extracted_metadata = json.dumps(updated_metadata)
            if owner:
                record.gemini_extracted_supplier_name = owner
        await session.commit()
    return True


async def find_metadata_by_hash(file_hash: str) -> Optional[Dict[str, Any]]:
    factory = get_session_factory()
    async with factory() as session:
        result = await session.execute(
            select(NeonDocumentEvidence)
            .where(NeonDocumentEvidence.file_hash == file_hash)
            .limit(1)
        )
        record = result.scalars().first()
    if not record:
        return None
    return {
        "gemini_extracted_supplier_name": record.gemini_extracted_supplier_name or "",
        "gemini_extracted_metadata": record.gemini_extracted_metadata or "{}",
    }


async def get_evidence_urls_by_supplier_id(supplier_id: int) -> List[Dict[str, str]]:
    """Optimized SQL query: Pushes supplier_id WHERE clause directly down to PostgreSQL database."""
    factory = get_session_factory()
    async with factory() as session:
        stmt = (
            select(NeonDocumentEvidence.filename, NeonDocumentEvidence.file_url)
            .where(
                NeonDocumentEvidence.supplier_id == supplier_id,
                NeonDocumentEvidence.file_url.isnot(None),
                NeonDocumentEvidence.file_url != "",
            )
        )
        res = await session.execute(stmt)
        rows = res.all()

    return [{"name": r.filename, "url": r.file_url} for r in rows]


async def get_screenshot_urls_by_supplier_id(supplier_id: int) -> List[str]:
    """Optimized SQL query: Pushes supplier_id WHERE clause directly down to PostgreSQL database."""
    factory = get_session_factory()
    async with factory() as session:
        stmt = (
            select(AuditLog.screenshot_url)
            .where(
                AuditLog.supplier_id == supplier_id,
                AuditLog.screenshot_url.isnot(None),
                AuditLog.screenshot_url != "",
            )
        )
        res = await session.execute(stmt)
        rows = res.all()

    return [r[0] for r in rows if r[0]]
