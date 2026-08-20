import logging
from typing import List, Optional

from sqlalchemy import func, select

from app.db.session import get_session_factory
from app.models.tables import AuditLog, DocumentEvidence as NeonDocumentEvidence
from app.repositories.object_storage import ObjectStorageRepository
from app.repositories.supplier_audit import AuditLogRepository, DocumentEvidenceRepository
from app.schemas import AuditLogEntry, DocumentEvidence
from app.services.audit_data.serializers import _display_timestamp, _to_audit_log_entry, _to_db_timestamp
from app.services.audit_data.suppliers import get_next_audit_id, get_or_create_supplier

logger = logging.getLogger(__name__)


async def get_audit_logs(audit_id: Optional[str] = None) -> List[AuditLogEntry]:
    factory = get_session_factory()
    async with factory() as session:
        repo = AuditLogRepository(session)
        if audit_id:
            log = await repo.get_by_audit_id(audit_id)
            return [_to_audit_log_entry(log)] if log else []
        logs = await repo.list_all(limit=10000)
    return [_to_audit_log_entry(log) for log in logs]


async def get_audit_registry(limit: int = 1000, offset: int = 0) -> List[dict]:
    factory = get_session_factory()
    async with factory() as session:
        doc_count_sub = (
            select(func.count(NeonDocumentEvidence.id))
            .where(NeonDocumentEvidence.audit_id == AuditLog.audit_id)
            .scalar_subquery()
        )
        stmt = (
            select(
                AuditLog.audit_id,
                AuditLog.supplier_id,
                AuditLog.supplier_name,
                AuditLog.result,
                AuditLog.created_at,
                doc_count_sub.label("document_count"),
            )
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        res = await session.execute(stmt)
        rows = res.all()

        result = []
        for r in rows:
            disp_ts = _display_timestamp(r.created_at)
            result.append({
                "audit_id": r.audit_id,
                "supplier_id": r.supplier_id,
                "supplier_name": r.supplier_name or "",
                "result": r.result or "Mismatch",
                "created_at": disp_ts,
                "timestamp": disp_ts,
                "document_count": r.document_count or 0,
            })
        return result


async def get_audit_registry_detail(audit_id: str) -> Optional[dict]:
    factory = get_session_factory()
    async with factory() as session:
        doc_count_sub = (
            select(func.count(NeonDocumentEvidence.id))
            .where(NeonDocumentEvidence.audit_id == AuditLog.audit_id)
            .scalar_subquery()
        )
        stmt = (
            select(AuditLog, doc_count_sub.label("document_count"))
            .where(AuditLog.audit_id == audit_id)
        )
        res = await session.execute(stmt)
        row = res.first()
        if not row:
            return None

        r, doc_count = row
        ts_val = getattr(r, "created_at", None) or getattr(r, "timestamp", None)
        disp_ts = _display_timestamp(ts_val)
        return {
            "audit_id": r.audit_id,
            "supplier_id": r.supplier_id,
            "supplier_name": r.supplier_name or "",
            "result": r.result or "Mismatch",
            "created_at": disp_ts,
            "timestamp": disp_ts,
            "document_count": doc_count or 0,
            "suggested_comment": r.suggested_comment or "",
            "screenshot_url": r.screenshot_url,
            "comparison_table": r.comparison_table,
        }


async def update_audit_result(
    audit_id: str,
    result: str,
    suggested_comment: str,
    comparison_table: Optional[dict] = None,
) -> bool:
    factory = get_session_factory()
    async with factory() as session:
        repo = AuditLogRepository(session)
        log = await repo.get_by_audit_id(audit_id)
        if not log:
            return False
        log.result = result
        log.suggested_comment = suggested_comment
        if comparison_table is not None:
            log.comparison_table = comparison_table
        await session.commit()
    return True


async def log_audit_run(
    supplier_name: str,
    doc_evidences: List[DocumentEvidence],
    audit_log: Optional[AuditLogEntry] = None,
) -> Optional[str]:
    """Persist an audit run: ensure supplier, insert evidence rows + audit log."""
    try:
        supplier_id = await get_or_create_supplier(supplier_name)

        audit_id = None
        if audit_log and not audit_log.audit_id.startswith("TEMP_"):
            audit_id = audit_log.audit_id
        if not audit_id:
            for doc in doc_evidences:
                if not doc.audit_id.startswith("TEMP_"):
                    audit_id = doc.audit_id
                    break
        if not audit_id:
            audit_id = await get_next_audit_id()

        for doc in doc_evidences:
            doc.supplier_id = supplier_id
            doc.audit_id = audit_id
        if audit_log:
            audit_log.supplier_id = supplier_id
            audit_log.audit_id = audit_id

        factory = get_session_factory()
        async with factory() as session:
            log_repo = AuditLogRepository(session)
            existing_log = await log_repo.get_by_audit_id(audit_id)

            if audit_log:
                log_ts = _to_db_timestamp(audit_log.created_at or audit_log.timestamp)
                if existing_log:
                    existing_log.created_at = log_ts
                    existing_log.supplier_name = audit_log.supplier_name
                    existing_log.workspace_title = audit_log.workspace_title or "Ariba Workspace"
                    existing_log.complete_qa_data_dump = audit_log.complete_qa_data_dump or "[]"
                    existing_log.compiled_extracted_data = audit_log.compiled_extracted_data or ""
                    existing_log.result = audit_log.result or "Mismatch"
                    existing_log.suggested_comment = audit_log.suggested_comment or ""
                    existing_log.screenshot_url = audit_log.screenshot_url
                    existing_log.comparison_input_tokens = audit_log.comparison_input_tokens or 0
                    existing_log.comparison_output_tokens = audit_log.comparison_output_tokens or 0
                    existing_log.comparison_cost_usd = float(audit_log.comparison_cost_usd or 0.0)
                    existing_log.total_run_cost_usd = float(audit_log.total_run_cost_usd or 0.0)
                    existing_log.comparison_table = audit_log.comparison_table
                    await session.commit()
                else:
                    await log_repo.create(AuditLog(
                        audit_id=audit_log.audit_id,
                        supplier_id=audit_log.supplier_id,
                        created_at=log_ts,
                        supplier_name=audit_log.supplier_name,
                        workspace_title=audit_log.workspace_title or "Ariba Workspace",
                        complete_qa_data_dump=audit_log.complete_qa_data_dump or "[]",
                        compiled_extracted_data=audit_log.compiled_extracted_data or "",
                        result=audit_log.result or "Mismatch",
                        suggested_comment=audit_log.suggested_comment or "",
                        screenshot_url=audit_log.screenshot_url,
                        comparison_input_tokens=audit_log.comparison_input_tokens or 0,
                        comparison_output_tokens=audit_log.comparison_output_tokens or 0,
                        comparison_cost_usd=float(audit_log.comparison_cost_usd or 0.0),
                        total_run_cost_usd=float(audit_log.total_run_cost_usd or 0.0),
                        comparison_table=audit_log.comparison_table,
                    ))
            elif doc_evidences and existing_log is None:
                first_ts = _to_db_timestamp(doc_evidences[0].created_at or doc_evidences[0].timestamp)
                await log_repo.create(AuditLog(
                    audit_id=audit_id,
                    supplier_id=supplier_id,
                    created_at=first_ts,
                    supplier_name=supplier_name,
                    compiled_extracted_data="[]",
                    suggested_comment="Pending comparison",
                ))

            ev_repo = DocumentEvidenceRepository(session)
            obj_repo = ObjectStorageRepository(session)

            for doc in doc_evidences:
                doc_ts = _to_db_timestamp(doc.created_at or doc.timestamp)
                object_id = None
                if doc.file_url:
                    obj_rec = await obj_repo.get_by_url(doc.file_url)
                    if obj_rec:
                        object_id = obj_rec.id

                await ev_repo.create(NeonDocumentEvidence(
                    audit_id=doc.audit_id,
                    supplier_id=doc.supplier_id,
                    created_at=doc_ts,
                    supplier_name=doc.supplier_name,
                    filename=doc.filename,
                    ariba_question_label=doc.ariba_question_label,
                    ariba_qa_answers=doc.ariba_qa_answers or "[]",
                    gemini_extracted_supplier_name=doc.gemini_extracted_supplier_name,
                    gemini_extracted_metadata=doc.gemini_extracted_metadata or "{}",
                    file_content_type=doc.file_content_type,
                    input_tokens=doc.input_tokens or 0,
                    output_tokens=doc.output_tokens or 0,
                    cost_usd=float(doc.cost_usd or 0.0),
                    object_id=object_id,
                ))
        return audit_id
    except Exception as e:
        logger.error(f"Failed to log audit run via Neon: {e}")
        return None
