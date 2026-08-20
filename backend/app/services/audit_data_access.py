"""Async data-access layer backed by the Neon repositories.

Replaces the legacy `sheets.py` (which talked to Supabase REST). Each function
opens its own short-lived session via the async session factory, so it can be
called from both sync and async FastAPI endpoints without threading concerns.
"""

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import select, func
from sqlalchemy.orm import joinedload

from app.db.session import get_session_factory
from app.models.tables import Supplier, AuditLog, DocumentEvidence as NeonDocumentEvidence
from app.repositories.supplier_audit import SupplierRepository, AuditLogRepository, DocumentEvidenceRepository
from app.schemas import AuditLogEntry, DocumentEvidence, DocumentEvidenceSummary, SupplierEntry

logger = logging.getLogger(__name__)

MYR_RATE = 4.10

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
    compiled = r.compiled_extracted_data or ""
    ts_val = getattr(r, "created_at", None) or getattr(r, "timestamp", None)
    disp_ts = _display_timestamp(ts_val)
    sup_name = r.supplier_name or ""
    return AuditLogEntry(
        audit_id=r.audit_id,
        supplier_id=r.supplier_id,
        created_at=disp_ts,
        timestamp=disp_ts,
        supplier_name=sup_name,
        workspace_title=r.workspace_title or "Ariba Workspace",
        complete_qa_data_dump=r.complete_qa_data_dump or "[]",
        compiled_extracted_data=compiled,
        result=r.result or "Mismatch",
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


# ── Document evidence ────────────────────────────────────────────────────────

def _to_document_evidence(r: NeonDocumentEvidence) -> DocumentEvidence:
    ts_val = getattr(r, "created_at", None) or getattr(r, "timestamp", None)
    disp_ts = _display_timestamp(ts_val)
    sup_name = r.supplier_name or ""
    return DocumentEvidence(
        id=str(r.id),
        audit_id=r.audit_id,
        supplier_id=r.supplier_id,
        created_at=disp_ts,
        timestamp=disp_ts,
        supplier_name=sup_name,
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
        # 1. CQ Checker (Supplier Audits)
        ev_repo = DocumentEvidenceRepository(session)
        evidence_records = await ev_repo.list_all(limit=100000)

        cq_total_cost_usd = 0.0
        supplier_map: dict = {}
        for r in evidence_records:
            name = r.supplier_name or "Unknown"
            c_usd = float(r.cost_usd or 0.0)
            cq_total_cost_usd += c_usd
            if name not in supplier_map:
                supplier_map[name] = {"supplier_name": name, "document_count": 0, "cost_usd": 0.0, "cost_myr": 0.0}
            supplier_map[name]["document_count"] += 1
            supplier_map[name]["cost_usd"] += c_usd
            supplier_map[name]["cost_myr"] += c_usd * MYR_RATE

        cq_breakdown = sorted(supplier_map.values(), key=lambda s: s["cost_usd"], reverse=True)
        cq_total_documents = len(evidence_records)
        cq_total_cost_myr = cq_total_cost_usd * MYR_RATE

        # 2. Chatbot RAG
        from app.models.tables import ChatLog, Document, DocumentPage
        from sqlalchemy import select, func

        chat_res = await session.execute(
            select(ChatLog).order_by(ChatLog.created_at.desc()).limit(1000)
        )
        chat_records = list(chat_res.scalars().all())

        chat_total_cost_usd = sum(float(c.cost_usd or 0.0) for c in chat_records)
        chat_total_cost_myr = chat_total_cost_usd * MYR_RATE
        chat_in_tokens = sum(c.input_tokens or 0 for c in chat_records)
        chat_out_tokens = sum(c.output_tokens or 0 for c in chat_records)
        chat_cache_hits = sum(1 for c in chat_records if c.cache_hit == 1)

        chat_logs_list = [
            {
                "id": str(c.id),
                "query_text": c.query_text,
                "input_tokens": c.input_tokens or 0,
                "output_tokens": c.output_tokens or 0,
                "cost_usd": float(c.cost_usd or 0.0),
                "cost_myr": round(float(c.cost_usd or 0.0) * MYR_RATE, 4),
                "cache_hit": c.cache_hit == 1,
                "latency_ms": c.latency_ms or 0,
                "cached_query_text": c.cached_query_text,
                "created_at": _display_timestamp(c.created_at),
            }
            for c in chat_records
        ]

        # 3. Document Ingestion
        from sqlalchemy.orm import joinedload
        doc_res = await session.execute(
            select(Document).options(joinedload(Document.object_storage)).order_by(Document.created_at.desc()).limit(1000)
        )
        doc_records = list(doc_res.scalars().all())

        ingest_total_cost_usd = sum(float(d.cost_usd or 0.0) for d in doc_records)
        ingest_total_cost_myr = ingest_total_cost_usd * MYR_RATE
        ingest_in_tokens = sum(d.input_tokens or 0 for d in doc_records)
        ingest_out_tokens = sum(d.output_tokens or 0 for d in doc_records)

        pages_res = await session.execute(select(func.count(DocumentPage.id)))
        ingest_total_pages = pages_res.scalar() or 0

        doc_list = []
        for d in doc_records:
            p_res = await session.execute(
                select(func.count(DocumentPage.id)).where(DocumentPage.document_id == d.id)
            )
            p_cnt = p_res.scalar() or 0
            doc_list.append({
                "id": str(d.id),
                "title": d.title,
                "file_url": d.file_url,
                "page_count": p_cnt,
                "input_tokens": d.input_tokens or 0,
                "output_tokens": d.output_tokens or 0,
                "cost_usd": float(d.cost_usd or 0.0),
                "cost_myr": round(float(d.cost_usd or 0.0) * MYR_RATE, 4),
                "created_at": _display_timestamp(d.created_at),
            })

    master_cost_usd = cq_total_cost_usd + chat_total_cost_usd + ingest_total_cost_usd
    master_cost_myr = master_cost_usd * MYR_RATE

    return {
        "master_cost_usd": round(master_cost_usd, 6),
        "master_cost_myr": round(master_cost_myr, 4),
        "total_cost_myr": round(cq_total_cost_myr, 4),
        "total_documents": cq_total_documents,
        "average_cost_myr": round(cq_total_cost_myr / cq_total_documents, 4) if cq_total_documents else 0.0,
        "breakdown": [{**s, "cost_usd": round(s["cost_usd"], 6), "cost_myr": round(s["cost_myr"], 4)} for s in cq_breakdown],
        "cq_checker": {
            "total_cost_usd": round(cq_total_cost_usd, 6),
            "total_cost_myr": round(cq_total_cost_myr, 4),
            "total_documents": cq_total_documents,
            "average_cost_myr": round(cq_total_cost_myr / cq_total_documents, 4) if cq_total_documents else 0.0,
            "breakdown": [{**s, "cost_usd": round(s["cost_usd"], 6), "cost_myr": round(s["cost_myr"], 4)} for s in cq_breakdown],
        },
        "chatbot": {
            "total_cost_usd": round(chat_total_cost_usd, 6),
            "total_cost_myr": round(chat_total_cost_myr, 4),
            "total_queries": len(chat_records),
            "cache_hits": chat_cache_hits,
            "cache_hit_rate_pct": round((chat_cache_hits / len(chat_records) * 100), 1) if chat_records else 0.0,
            "input_tokens": chat_in_tokens,
            "output_tokens": chat_out_tokens,
            "logs": chat_logs_list,
        },
        "ingestion": {
            "total_cost_usd": round(ingest_total_cost_usd, 6),
            "total_cost_myr": round(ingest_total_cost_myr, 4),
            "total_documents": len(doc_records),
            "total_pages": ingest_total_pages,
            "input_tokens": ingest_in_tokens,
            "output_tokens": ingest_out_tokens,
            "documents": doc_list,
        },
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
            from app.repositories.object_storage import ObjectStorageRepository
            obj_repo = ObjectStorageRepository(session)

            for doc in doc_evidences:
                import json
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
