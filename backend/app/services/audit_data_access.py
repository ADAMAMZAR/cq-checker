"""Async data-access layer backed by the Neon repositories.

Replaces the legacy `sheets.py` (which talked to Supabase REST). Each function
opens its own short-lived session via the async session factory, so it can be
called from both sync and async FastAPI endpoints without threading concerns.
"""

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from app.db.session import get_session_factory
from app.models.tables import Supplier, AuditLog, DocumentEvidence as NeonDocumentEvidence
from app.repositories.supplier_audit import SupplierRepository, AuditLogRepository, DocumentEvidenceRepository
from app.schemas import AuditLogEntry, DocumentEvidence, SupplierEntry

logger = logging.getLogger(__name__)

MYR_RATE = 4.70

# GPO operates in UTC+8 (Singapore/Malaysia, no DST). Legacy audit timestamps
# were stored as naive local wall-clock strings; preserve that wall-clock when
# converting to TIMESTAMPTZ and back.
_LOCAL_TZ = timezone(timedelta(hours=8))


def _to_db_timestamp(value: Any) -> Optional[datetime]:
    """Coerce a legacy string timestamp (dd/mm/YYYY, HH:MM:SS or ISO) to datetime.

    The DB columns are now TIMESTAMPTZ; writers may still pass the old display
    strings (from main.py or the Chrome extension), so parse before insert.
    """
    if value is None or value == "":
        return datetime.now(_LOCAL_TZ)
    if isinstance(value, datetime):
        return value
    s = str(value).strip()
    for fmt in ("%d/%m/%Y, %H:%M:%S", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S"):
        try:
            dt = datetime.strptime(s, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=_LOCAL_TZ)
            return dt
        except ValueError:
            continue
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=_LOCAL_TZ)
        return dt
    except ValueError:
        return datetime.now(_LOCAL_TZ)


def _display_timestamp(value: Any) -> str:
    """Format a DB timestamptz back to the legacy dd/mm/YYYY, HH:MM:SS string."""
    if value is None:
        return ""
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=_LOCAL_TZ)
        return value.astimezone(_LOCAL_TZ).strftime("%d/%m/%Y, %H:%M:%S")
    return str(value)


# ── Suppliers ────────────────────────────────────────────────────────────────

async def get_or_create_supplier(supplier_name: str) -> int:
    name = supplier_name.strip()
    factory = get_session_factory()
    async with factory() as session:
        repo = SupplierRepository(session)
        supplier = await repo.get_or_create(name)
        return supplier.id


async def list_suppliers() -> List[SupplierEntry]:
    factory = get_session_factory()
    async with factory() as session:
        repo = SupplierRepository(session)
        suppliers = await repo.list_all()
    return [
        SupplierEntry(
            supplier_id=s.id,
            supplier_name=s.supplier_name,
            created_at=s.created_at.strftime("%d/%m/%Y, %H:%M:%S") if getattr(s, "created_at", None) else "",
            date_added=s.created_at.strftime("%d/%m/%Y, %H:%M:%S") if getattr(s, "created_at", None) else "",
        )
        for s in suppliers
    ]


async def get_next_audit_id() -> str:
    """Return a stable sequential-style audit id.

    The legacy system used a Postgres RPC (fn_next_audit_id) to produce ids like
    AUDIT_0001. We reproduce the same format by counting existing audit logs.
    """
    factory = get_session_factory()
    async with factory() as session:
        result = await session.execute(select(NeonDocumentEvidence.audit_id))
        existing = [r[0] for r in result if r[0] and r[0].startswith("AUDIT_")]
    if existing:
        max_num = max(int(aid.replace("AUDIT_", "")) for aid in existing if aid.replace("AUDIT_", "").isdigit())
        return f"AUDIT_{max_num + 1:04d}"
    return "AUDIT_0001"


# ── Audit logs ───────────────────────────────────────────────────────────────

def _to_audit_log_entry(r: AuditLog) -> AuditLogEntry:
    expiration_date = "N/A"
    cert_type = "Relational evidence"
    compiled = r.compiled_extracted_data or ""
    try:
        import json
        extracted_docs = json.loads(compiled)
        if isinstance(extracted_docs, list) and extracted_docs:
            first = extracted_docs[0].get("extracted_data", {})
            expiration_date = first.get("expirationDate", "N/A")
            cert_type = first.get("certificateType", "Relational evidence")
    except Exception:
        pass
    ts_val = getattr(r, "created_at", None) or getattr(r, "timestamp", None)
    disp_ts = _display_timestamp(ts_val)
    return AuditLogEntry(
        audit_id=r.audit_id,
        supplier_id=r.supplier_id,
        created_at=disp_ts,
        timestamp=disp_ts,
        supplier_name=r.supplier_name,
        workspace_title=r.workspace_title or "Ariba Workspace",
        cert_type=cert_type,
        complete_qa_data_dump=r.complete_qa_data_dump or "[]",
        compiled_extracted_data=compiled,
        result=r.result or "Mismatch",
        expiration_date=expiration_date,
        suggested_comment=r.suggested_comment or "",
        screenshot_url=r.screenshot_url,
        comparison_input_tokens=r.comparison_input_tokens or 0,
        comparison_output_tokens=r.comparison_output_tokens or 0,
        comparison_cost_usd=float(r.comparison_cost_usd or 0.0),
        total_run_cost_usd=float(r.total_run_cost_usd or 0.0),
        comparison_table=r.comparison_table,
    )


async def get_audit_logs(audit_id: Optional[str] = None) -> List[AuditLogEntry]:
    factory = get_session_factory()
    async with factory() as session:
        repo = AuditLogRepository(session)
        if audit_id:
            log = await repo.get_by_audit_id(audit_id)
            return [_to_audit_log_entry(log)] if log else []
        logs = await repo.list_all(limit=10000)
    return [_to_audit_log_entry(log) for log in logs]


async def get_audit_registry() -> List[dict]:
    factory = get_session_factory()
    async with factory() as session:
        repo = AuditLogRepository(session)
        logs = await repo.list_all(limit=10000)
        ev_repo = DocumentEvidenceRepository(session)
        counts: dict = {}
        for audit in await ev_repo.list_all(limit=100000):
            counts[audit.audit_id] = counts.get(audit.audit_id, 0) + 1
    result = []
    for r in logs:
        ts_val = getattr(r, "created_at", None) or getattr(r, "timestamp", None)
        disp_ts = _display_timestamp(ts_val)
        result.append({
            "audit_id": r.audit_id,
            "supplier_id": r.supplier_id,
            "supplier_name": r.supplier_name,
            "result": r.result or "Mismatch",
            "created_at": disp_ts,
            "timestamp": disp_ts,
            "cert_type": "Relational evidence",
            "document_count": counts.get(r.audit_id, 0),
            "suggested_comment": r.suggested_comment or "",
            "screenshot_url": r.screenshot_url,
            "comparison_table": r.comparison_table,
        })
    return result


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


# ── Document evidence ────────────────────────────────────────────────────────

def _to_document_evidence(r: NeonDocumentEvidence) -> DocumentEvidence:
    ts_val = getattr(r, "created_at", None) or getattr(r, "timestamp", None)
    disp_ts = _display_timestamp(ts_val)
    return DocumentEvidence(
        audit_id=r.audit_id,
        supplier_id=r.supplier_id,
        created_at=disp_ts,
        timestamp=disp_ts,
        supplier_name=r.supplier_name,
        filename=r.filename,
        ariba_question_label=r.ariba_question_label,
        ariba_qa_answers=r.ariba_qa_answers or "[]",
        gemini_extracted_supplier_name=r.gemini_extracted_supplier_name or "",
        gemini_extracted_metadata=r.gemini_extracted_metadata or "{}",
        file_content_type=r.file_content_type or "",
        input_tokens=r.input_tokens or 0,
        output_tokens=r.output_tokens or 0,
        cost_usd=float(r.cost_usd or 0.0),
        file_hash=r.file_hash,
        file_url=r.file_url,
    )


async def get_document_evidence_logs(
    audit_id: Optional[str] = None,
    supplier_name: Optional[str] = None,
) -> List[DocumentEvidence]:
    factory = get_session_factory()
    async with factory() as session:
        repo = DocumentEvidenceRepository(session)
        if audit_id:
            records = await repo.get_by_audit_id(audit_id)
        else:
            records = await repo.list_all(limit=100000)
    if supplier_name:
        records = [r for r in records if r.supplier_name and supplier_name.lower() in r.supplier_name.lower()]
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
        import json
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
    """Return cached extraction metadata for identical file bytes (any question).

    Extraction is question-agnostic (the extractor returns every certificate in
    the file), so the same bytes can be reused across every question that
    references the file — each question is then audited separately.
    """
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
    factory = get_session_factory()
    async with factory() as session:
        repo = DocumentEvidenceRepository(session)
        records = await repo.list_all(limit=100000)
    return [
        {"name": r.filename, "url": r.file_url}
        for r in records if r.supplier_id == supplier_id and r.file_url
    ]


async def get_screenshot_urls_by_supplier_id(supplier_id: int) -> List[str]:
    factory = get_session_factory()
    async with factory() as session:
        repo = AuditLogRepository(session)
        logs = await repo.list_all(limit=100000)
    return [log.screenshot_url for log in logs if log.supplier_id == supplier_id and log.screenshot_url]


async def get_cost_analytics() -> dict:
    factory = get_session_factory()
    async with factory() as session:
        repo = DocumentEvidenceRepository(session)
        records = await repo.list_all(limit=100000)
    total_cost_myr = 0.0
    supplier_map: dict = {}
    for r in records:
        name = r.supplier_name or "Unknown"
        cost_myr = float(r.cost_usd or 0.0) * MYR_RATE
        total_cost_myr += cost_myr
        if name not in supplier_map:
            supplier_map[name] = {"supplier_name": name, "document_count": 0, "cost_myr": 0.0}
        supplier_map[name]["document_count"] += 1
        supplier_map[name]["cost_myr"] += cost_myr
    breakdown = sorted(supplier_map.values(), key=lambda s: s["cost_myr"], reverse=True)
    total_documents = len(records)
    return {
        "total_cost_myr": round(total_cost_myr, 4),
        "total_documents": total_documents,
        "average_cost_myr": round(total_cost_myr / total_documents, 4) if total_documents else 0.0,
        "breakdown": [{**s, "cost_myr": round(s["cost_myr"], 4)} for s in breakdown],
    }


# ── Audit run (combined write path) ──────────────────────────────────────────

async def log_audit_run(
    supplier_name: str,
    doc_evidences: List[DocumentEvidence],
    audit_log: Optional[AuditLogEntry] = None,
) -> Optional[str]:
    """Persist an audit run: ensure supplier, insert evidence rows + audit log.

    The audit_log row is always created/upserted BEFORE any evidence rows so the
    ``document_evidence.audit_id -> audit_logs.audit_id`` FK holds. When no
    audit_log is provided but evidence exists (Phase 1 extract flow), a minimal
    placeholder audit log is created; the Phase 2 comparison then updates it.
    """
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
                    existing_log.cert_type = audit_log.cert_type or "Relational evidence"
                    existing_log.complete_qa_data_dump = audit_log.complete_qa_data_dump or "[]"
                    existing_log.compiled_extracted_data = audit_log.compiled_extracted_data or ""
                    existing_log.result = audit_log.result or "Mismatch"
                    existing_log.expiration_date = audit_log.expiration_date or "N/A"
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
                        cert_type=audit_log.cert_type or "Relational evidence",
                        complete_qa_data_dump=audit_log.complete_qa_data_dump or "[]",
                        compiled_extracted_data=audit_log.compiled_extracted_data or "",
                        result=audit_log.result or "Mismatch",
                        expiration_date=audit_log.expiration_date or "N/A",
                        suggested_comment=audit_log.suggested_comment or "",
                        screenshot_url=audit_log.screenshot_url,
                        comparison_input_tokens=audit_log.comparison_input_tokens or 0,
                        comparison_output_tokens=audit_log.comparison_output_tokens or 0,
                        comparison_cost_usd=float(audit_log.comparison_cost_usd or 0.0),
                        total_run_cost_usd=float(audit_log.total_run_cost_usd or 0.0),
                        comparison_table=audit_log.comparison_table,
                    ))
            elif doc_evidences and existing_log is None:
                # Phase 1 (extract-only) flow: placeholder so the FK holds until
                # /api/audit/comparison fills in the real verdict.
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
            for doc in doc_evidences:
                import json
                doc_ts = _to_db_timestamp(doc.created_at or doc.timestamp)
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
                    file_hash=doc.file_hash,
                    file_url=doc.file_url,
                ))
        return audit_id
    except Exception as e:
        logger.error(f"Failed to log audit run via Neon: {e}")
        return None
