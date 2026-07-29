from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from typing import List, Dict, Any, Optional
import requests
from app.config import settings
from app.schemas import SupplierEntry, DocumentEvidence, AuditLogEntry

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# All functions below directly call Supabase REST API (no Google Sheets)
# ---------------------------------------------------------------------------

def get_supabase_headers() -> Dict[str, str]:
    return {
        "apikey": settings.supabase_key,
        "Authorization": f"Bearer {settings.supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

def call_supabase_select(table_name: str, query_params: Optional[Dict[str, str]] = None) -> List[Dict[str, Any]]:
    if not settings.supabase_url or not settings.supabase_key:
        return []
    try:
        url = f"{settings.supabase_url.rstrip('/')}/rest/v1/{table_name}"
        params = {"select": "*"}
        if query_params:
            params.update(query_params)
        response = requests.get(
            url,
            headers=get_supabase_headers(),
            params=params,
            timeout=15
        )
        if response.status_code == 200:
            return response.json()
        logger.error(f"Supabase SELECT failed: {response.status_code} - {response.text[:250]}")
        return []
    except Exception as e:
        logger.error(f"Supabase SELECT exception: {e}")
        return []

def call_supabase_insert(table_name: str, rows: List[Dict[str, Any]]) -> bool:
    if not settings.supabase_url or not settings.supabase_key:
        return False
    try:
        url = f"{settings.supabase_url.rstrip('/')}/rest/v1/{table_name}"
        response = requests.post(
            url,
            headers=get_supabase_headers(),
            json=rows,
            timeout=15
        )
        if response.status_code in (200, 201):
            return True
        logger.error(f"Supabase INSERT failed: {response.status_code} - {response.text[:250]}")
        return False
    except Exception as e:
        logger.error(f"Supabase INSERT exception: {e}")
        return False

def call_supabase_update(table_name: str, filters: Dict[str, str], updates: Dict[str, Any]) -> bool:
    if not settings.supabase_url or not settings.supabase_key:
        return False
    try:
        url = f"{settings.supabase_url.rstrip('/')}/rest/v1/{table_name}"
        response = requests.patch(
            url,
            headers=get_supabase_headers(),
            params=filters,
            json=updates,
            timeout=15
        )
        if response.status_code in (200, 201, 204):
            return True
        logger.error(f"Supabase UPDATE failed: {response.status_code} - {response.text[:250]}")
        return False
    except Exception as e:
        logger.error(f"Supabase UPDATE exception: {e}")
        return False

def upload_file_to_supabase_storage(file_bytes: bytes, safe_supplier_name: str, filename: str, content_type: str) -> Optional[str]:
    if not settings.supabase_url or not settings.supabase_key:
        return None
    try:
        from urllib.parse import quote
        safe_supplier_encoded = quote(safe_supplier_name)
        filename_encoded = quote(filename)

        url = f"{settings.supabase_url.rstrip('/')}/storage/v1/object/certificates/{safe_supplier_encoded}/{filename_encoded}"
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": content_type
        }

        response = requests.post(url, headers=headers, data=file_bytes, timeout=30)

        if response.status_code in (200, 201):
            return f"{settings.supabase_url.rstrip('/')}/storage/v1/object/public/certificates/{safe_supplier_encoded}/{filename_encoded}"
        elif response.status_code == 400 and "already exists" in response.text.lower():
            return f"{settings.supabase_url.rstrip('/')}/storage/v1/object/public/certificates/{safe_supplier_encoded}/{filename_encoded}"

        logger.error(f"Supabase storage upload failed: {response.status_code} - {response.text}")
        return None
    except Exception as e:
        logger.error(f"Supabase storage upload exception: {e}")
        return None

def call_supabase_rpc(function_name: str, params: Optional[Dict[str, Any]] = None) -> Optional[Any]:
    if not settings.supabase_url or not settings.supabase_key:
        return None
    try:
        url = f"{settings.supabase_url.rstrip('/')}/rest/v1/rpc/{function_name}"
        response = requests.post(
            url,
            headers=get_supabase_headers(),
            json=params or {},
            timeout=15
        )
        if response.status_code == 200:
            return response.json()
        logger.error(f"Supabase RPC failed: {response.status_code} - {response.text[:250]}")
        return None
    except Exception as e:
        logger.error(f"Supabase RPC exception: {e}")
        return None

def get_or_create_supplier(supplier_name: str) -> int:
    name = supplier_name.strip()

    records = call_supabase_select("supplier_list", {
        "supplier_name": f"ilike.{name}",
        "select": "supplier_id",
    })
    if records:
        try:
            return int(records[0]["supplier_id"])
        except (ValueError, TypeError, KeyError):
            pass

    max_records = call_supabase_select("supplier_list", {
        "select": "supplier_id",
        "order": "supplier_id.desc.nullslast",
        "limit": "1",
    })
    new_id = (int(max_records[0]["supplier_id"]) if max_records else 0) + 1
    timestamp = datetime.now().strftime("%d/%m/%Y, %H:%M:%S")

    inserted = call_supabase_insert("supplier_list", [{
        "supplier_id": new_id,
        "supplier_name": name,
        "date_added": timestamp
    }])
    if inserted:
        return new_id

    records = call_supabase_select("supplier_list", {
        "supplier_name": f"ilike.{name}",
        "select": "supplier_id",
    })
    if records:
        try:
            return int(records[0]["supplier_id"])
        except (ValueError, TypeError, KeyError):
            pass

    logger.error(f"Failed to create or find supplier: {name}")
    return 0

def get_next_audit_id() -> str:
    result = call_supabase_rpc("fn_next_audit_id")
    if result and isinstance(result, str):
        return result
    logger.error("fn_next_audit_id RPC returned unexpected result, falling back to UUID")
    import uuid
    return str(uuid.uuid4())

def log_audit_run(supplier_name: str, doc_evidences: List[DocumentEvidence], audit_log: Optional[AuditLogEntry] = None) -> Optional[str]:
    try:
        supplier_id = get_or_create_supplier(supplier_name)

        audit_id = None
        if audit_log and not audit_log.audit_id.startswith("TEMP_"):
            audit_id = audit_log.audit_id
        if not audit_id:
            for doc in doc_evidences:
                if not doc.audit_id.startswith("TEMP_"):
                    audit_id = doc.audit_id
                    break
        if not audit_id:
            audit_id = get_next_audit_id()

        for doc in doc_evidences:
            doc.supplier_id = supplier_id
            doc.audit_id = audit_id
        if audit_log:
            audit_log.supplier_id = supplier_id
            audit_log.audit_id = audit_id

        doc_rows = []
        for doc in doc_evidences:
            doc_rows.append({
                "audit_id": doc.audit_id,
                "supplier_id": doc.supplier_id,
                "timestamp": doc.timestamp,
                "supplier_name": doc.supplier_name,
                "filename": doc.filename,
                "ariba_question_label": doc.ariba_question_label,
                "ariba_qa_answers": doc.ariba_qa_answers,
                "gemini_extracted_supplier_name": doc.gemini_extracted_supplier_name,
                "gemini_extracted_metadata": doc.gemini_extracted_metadata,
                "file_content_type": doc.file_content_type,
                "input_tokens": doc.input_tokens,
                "output_tokens": doc.output_tokens,
                "cost_usd": doc.cost_usd,
                "file_hash": doc.file_hash,
                "file_url": doc.file_url
            })
        call_supabase_insert("document_evidence", doc_rows)

        if audit_log:
            results_row = [{
                "audit_id": audit_log.audit_id,
                "supplier_id": audit_log.supplier_id,
                "timestamp": audit_log.timestamp,
                "supplier_name": audit_log.supplier_name,
                "workspace_title": audit_log.workspace_title or "Ariba Workspace",
                "complete_qa_data_dump": audit_log.complete_qa_data_dump or "[]",
                "compiled_extracted_data": audit_log.compiled_extracted_data,
                "suggested_comments": audit_log.suggested_comment,
                "result": audit_log.result or "Mismatch",
                "screenshot_url": audit_log.screenshot_url,
                "comparison_table": audit_log.comparison_table,
                "comparison_input_tokens": audit_log.comparison_input_tokens,
                "comparison_output_tokens": audit_log.comparison_output_tokens,
                "comparison_cost_usd": audit_log.comparison_cost_usd,
                "total_run_cost_usd": audit_log.total_run_cost_usd
            }]
            call_supabase_insert("audit_results", results_row)

        return audit_id
    except Exception as e:
        logger.error(f"Failed to log audit run via Supabase: {e}")
        return None

def get_audit_logs(
    audit_id: Optional[str] = None,
) -> List[AuditLogEntry]:
    query_params = {}
    if audit_id is not None:
        query_params["audit_id"] = f"eq.{audit_id}"
    records = call_supabase_select("audit_results", query_params or None)
    logs = []
    for r in records:
        compiled_data = str(r.get("compiled_extracted_data", ""))
        comments = str(r.get("suggested_comments", ""))
        comp_table = r.get("comparison_table")
        if isinstance(comp_table, str) and comp_table:
            try:
                comp_table = json.loads(comp_table)
            except Exception:
                comp_table = None

        workspace_title = str(r.get("workspace_title", "")) or "Ariba Workspace"
        complete_qa_data_dump = str(r.get("complete_qa_data_dump", "")) or "[]"

        result = str(r.get("result", "Match")) or "Mismatch"
        expiration_date = "N/A"
        cert_type = "Relational evidence"
        try:
            if compiled_data:
                extracted_docs = json.loads(compiled_data)
                if extracted_docs and isinstance(extracted_docs, list):
                    first_doc = extracted_docs[0]
                    extracted_data = first_doc.get("extracted_data", {})
                    expiration_date = extracted_data.get("expirationDate", "N/A")
                    cert_type = extracted_data.get("certificateType", "Relational evidence")
        except Exception:
            pass

        logs.append(AuditLogEntry(
            audit_id=str(r.get("audit_id", "")),
            supplier_id=int(r.get("supplier_id", 0)),
            timestamp=str(r.get("timestamp", "")),
            supplier_name=str(r.get("supplier_name", "")),
            workspace_title=workspace_title,
            cert_type=cert_type,
            complete_qa_data_dump=complete_qa_data_dump,
            compiled_extracted_data=compiled_data,
            result=result,
            expiration_date=expiration_date,
            suggested_comment=comments,
            screenshot_url=str(r.get("screenshot_url", "")) if r.get("screenshot_url") else None,
            comparison_input_tokens=int(r.get("comparison_input_tokens", 0)) if r.get("comparison_input_tokens") else 0,
            comparison_output_tokens=int(r.get("comparison_output_tokens", 0)) if r.get("comparison_output_tokens") else 0,
            comparison_cost_usd=float(r.get("comparison_cost_usd", 0.0)) if r.get("comparison_cost_usd") else 0.0,
            total_run_cost_usd=float(r.get("total_run_cost_usd", 0.0)) if r.get("total_run_cost_usd") else 0.0,
            comparison_table=comp_table
        ))
    return logs

def get_document_evidence_logs(
    audit_id: Optional[str] = None,
    supplier_name: Optional[str] = None,
) -> List[DocumentEvidence]:
    query_params = {}
    if audit_id is not None:
        query_params["audit_id"] = f"eq.{audit_id}"
    if supplier_name is not None:
        query_params["supplier_name"] = f"ilike.{supplier_name}"
    records = call_supabase_select("document_evidence", query_params or None)
    logs = []
    for r in records:
        logs.append(DocumentEvidence(
            audit_id=str(r.get("audit_id", "")),
            supplier_id=int(r.get("supplier_id", 0)),
            timestamp=str(r.get("timestamp", "")),
            supplier_name=str(r.get("supplier_name", "")),
            filename=str(r.get("filename", "")),
            ariba_question_label=str(r.get("ariba_question_label", "")),
            ariba_qa_answers=str(r.get("ariba_qa_answers", "")),
            gemini_extracted_supplier_name=str(r.get("gemini_extracted_supplier_name", "")),
            gemini_extracted_metadata=str(r.get("gemini_extracted_metadata", "")),
            file_content_type=str(r.get("file_content_type", "")),
            input_tokens=int(r.get("input_tokens", 0)) if r.get("input_tokens") else 0,
            output_tokens=int(r.get("output_tokens", 0)) if r.get("output_tokens") else 0,
            cost_usd=float(r.get("cost_usd", 0.0)) if r.get("cost_usd") else 0.0,
            file_hash=str(r.get("file_hash", "")) if r.get("file_hash") else None,
            file_url=str(r.get("file_url", "")) if r.get("file_url") else None
        ))
    return logs

def get_audit_registry() -> List[dict]:
    """Return consolidated audit registry data with document counts per audit."""
    ar_records = call_supabase_select("audit_results", {
        "select": "audit_id,supplier_id,supplier_name,timestamp,result,suggested_comments,screenshot_url,comparison_table",
    })
    de_records = call_supabase_select("document_evidence", {
        "select": "audit_id",
    })

    de_counts: dict[str, int] = {}
    for r in de_records:
        aid = str(r.get("audit_id", ""))
        de_counts[aid] = de_counts.get(aid, 0) + 1

    result = []
    for r in ar_records:
        aid = str(r.get("audit_id", ""))
        comp_table = r.get("comparison_table")
        if isinstance(comp_table, str) and comp_table:
            try:
                comp_table = json.loads(comp_table)
            except Exception:
                comp_table = None
        result.append({
            "audit_id": aid,
            "supplier_id": int(r.get("supplier_id", 0)),
            "supplier_name": str(r.get("supplier_name", "")),
            "result": str(r.get("result", "Match")),
            "timestamp": str(r.get("timestamp", "")),
            "cert_type": "Relational evidence",
            "document_count": de_counts.get(aid, 0),
            "suggested_comment": str(r.get("suggested_comments", "")),
            "screenshot_url": str(r.get("screenshot_url", "")) if r.get("screenshot_url") else None,
            "comparison_table": comp_table,
        })
    return result

def update_document_evidence(audit_id: str, filename: str, updated_metadata: Dict[str, Any]) -> bool:
    filters = {"audit_id": f"eq.{audit_id}", "filename": f"eq.{filename}"}
    updates = {
        "gemini_extracted_metadata": json.dumps(updated_metadata)
    }
    owner_name = updated_metadata.get("certificateOwnerName")
    if owner_name:
        updates["gemini_extracted_supplier_name"] = owner_name

    return call_supabase_update("document_evidence", filters, updates)

def find_metadata_by_hash(file_hash: str, ariba_question_label: str) -> Optional[Dict[str, Any]]:
    records = call_supabase_select("document_evidence", {
        "file_hash": f"eq.{file_hash}",
        "ariba_question_label": f"eq.{ariba_question_label}",
        "select": "gemini_extracted_supplier_name,gemini_extracted_metadata",
        "order": "id.desc",
        "limit": "1",
    })
    if records:
        r = records[0]
        return {
            "gemini_extracted_supplier_name": str(r.get("gemini_extracted_supplier_name", "")),
            "gemini_extracted_metadata": str(r.get("gemini_extracted_metadata", ""))
        }
    return None

def get_evidence_urls_by_supplier_id(supplier_id: int) -> List[Dict[str, str]]:
    """Return filename + file_url pairs for a supplier, fetching only needed columns."""
    records = call_supabase_select("document_evidence", {
        "supplier_id": f"eq.{supplier_id}",
        "select": "filename,file_url",
    })
    return [
        {"name": r.get("filename", ""), "url": r.get("file_url", "")}
        for r in records if r.get("file_url")
    ]

def get_screenshot_urls_by_supplier_id(supplier_id: int) -> List[str]:
    """Return screenshot URLs for a supplier, fetching only needed columns."""
    records = call_supabase_select("audit_results", {
        "supplier_id": f"eq.{supplier_id}",
        "select": "screenshot_url",
    })
    return [
        str(r.get("screenshot_url", ""))
        for r in records if r.get("screenshot_url")
    ]

def get_cost_analytics() -> dict:
    records = call_supabase_select("document_evidence", {
        "select": "supplier_name,cost_usd",
    })
    MYR_RATE = 4.70
    total_cost_myr = 0.0
    total_documents = len(records)
    supplier_map: dict[str, dict] = {}
    for r in records:
        name = str(r.get("supplier_name", "Unknown"))
        cost_usd = float(r.get("cost_usd") or 0.0)
        cost_myr = cost_usd * MYR_RATE
        total_cost_myr += cost_myr
        if name not in supplier_map:
            supplier_map[name] = {"supplier_name": name, "document_count": 0, "cost_myr": 0.0}
        supplier_map[name]["document_count"] += 1
        supplier_map[name]["cost_myr"] += cost_myr
    breakdown = sorted(supplier_map.values(), key=lambda s: s["cost_myr"], reverse=True)
    return {
        "total_cost_myr": round(total_cost_myr, 4),
        "total_documents": total_documents,
        "average_cost_myr": round(total_cost_myr / total_documents, 4) if total_documents else 0.0,
        "breakdown": [{**s, "cost_myr": round(s["cost_myr"], 4)} for s in breakdown],
    }

def update_audit_result(audit_id: str, result: str, suggested_comment: str, comparison_table: Optional[dict] = None) -> bool:
    filters = {"audit_id": f"eq.{audit_id}"}
    updates = {
        "suggested_comments": suggested_comment
    }
    if comparison_table is not None:
        updates["comparison_table"] = comparison_table
    return call_supabase_update("audit_results", filters, updates)
