from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from app.models.tables import AuditLog, DocumentEvidence as NeonDocumentEvidence
from app.schemas import AuditLogEntry, DocumentEvidence

MYR_RATE = 4.10
_LOCAL_TZ = timezone(timedelta(hours=8))


def _to_db_timestamp(value: Any) -> Optional[datetime]:
    """Coerce a legacy string timestamp (dd/mm/YYYY, HH:MM:SS or ISO) to datetime."""
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
