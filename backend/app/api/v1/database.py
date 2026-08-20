import json
import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError

from app.schemas import (
    AuditRegistryDetail,
    AuditRegistryEntry,
    DocumentEvidence,
    DocumentEvidenceSummary,
    UpdateEvidenceRequest,
)
from app.services import audit_data_access, auditor, database_inspector

logger = logging.getLogger(__name__)
router = APIRouter()


def _wrap_cert(cert: dict) -> dict:
    """Wrap a flat certificate dict into the nested {"certificates": [...]} shape."""
    return {"certificates": [cert] if isinstance(cert, dict) else []}


@router.get("/api/audit-registry", response_model=List[AuditRegistryEntry], tags=["Supplier Audit — Read / Update"])
async def get_audit_registry(limit: int = 1000, offset: int = 0):
    return await audit_data_access.get_audit_registry(limit=limit, offset=offset)


@router.get("/api/audit-registry/{audit_id}", response_model=AuditRegistryDetail, tags=["Supplier Audit — Read / Update"])
async def get_audit_registry_detail(audit_id: str):
    if not audit_id.strip():
        raise HTTPException(status_code=400, detail="Audit ID cannot be empty.")
    detail = await audit_data_access.get_audit_registry_detail(audit_id)
    if not detail:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit record not found.")
    return detail


@router.get("/api/evidence/summary", response_model=List[DocumentEvidenceSummary], tags=["Supplier Audit — Read / Update"])
async def get_evidence_summary(
    supplier_name: Optional[str] = None,
    supplier_id: Optional[int] = None,
    audit_id: Optional[str] = None,
):
    return await audit_data_access.get_document_evidence_summary(
        supplier_name=supplier_name,
        supplier_id=supplier_id,
        audit_id=audit_id,
    )


@router.get("/api/evidence/{document_id}", response_model=DocumentEvidence, tags=["Supplier Audit — Read / Update"])
async def get_evidence_document(document_id: str):
    if not document_id.strip():
        raise HTTPException(status_code=400, detail="Document ID cannot be empty.")
    evidence = await audit_data_access.get_document_evidence_by_id(document_id)
    if not evidence:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document evidence record not found.")
    return evidence


@router.get("/api/evidence", response_model=List[DocumentEvidence], tags=["Supplier Audit — Read / Update"])
async def get_evidence(audit_id: Optional[str] = None):
    return await audit_data_access.get_document_evidence_logs(audit_id=audit_id)


@router.put("/api/evidence", tags=["Supplier Audit — Read / Update"])
async def update_evidence(payload: UpdateEvidenceRequest):
    matching_docs = await audit_data_access.get_document_evidence_logs(audit_id=payload.audit_id)
    if not matching_docs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit ID not found."
        )

    record_found = any(d.filename == payload.filename for d in matching_docs)
    if not record_found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Matching document evidence record not found."
        )

    supplier_name = matching_docs[0].supplier_name
    file_contexts = []
    extracted_results = []
    combined_title = " ".join(d.ariba_question_label for d in matching_docs)

    for doc in matching_docs:
        file_contexts.append({
            "filename": doc.filename,
            "ariba_question_label": auditor.clean_question_label(doc.ariba_question_label),
            "ariba_qa_answers": doc.ariba_qa_answers,
        })
        if doc.filename == payload.filename:
            extracted_results.append(_wrap_cert(payload.updated_metadata))
        else:
            try:
                meta = json.loads(doc.gemini_extracted_metadata)
            except Exception:
                meta = {}
            extracted_results.append(meta)

    try:
        audit_result, suggested_comment, comparison_table = auditor.run_full_audit(
            supplier_name, file_contexts, extracted_results,
            qa_data_title=combined_title,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Verdict recalculation failed — no data was saved: {e}"
        )

    success = await audit_data_access.update_document_evidence(
        audit_id=payload.audit_id,
        filename=payload.filename,
        updated_metadata=_wrap_cert(payload.updated_metadata),
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save updated metadata."
        )

    await audit_data_access.update_audit_result(
        audit_id=payload.audit_id,
        result=audit_result,
        suggested_comment=suggested_comment,
        comparison_table=comparison_table,
    )

    return {
        "status": "success",
        "message": "Document evidence updated successfully.",
        "audit_result": audit_result,
        "suggested_comment": suggested_comment,
        "comparison_table": comparison_table,
    }


# ── Read-only & Editor Database Grid Browser ──────────────────────────────────

@router.get("/api/db/tables", tags=["Database Browser"])
async def db_list_tables():
    return await database_inspector.list_tables()


@router.get("/api/db/schema", tags=["Database Browser"])
async def db_get_schema():
    return await database_inspector.get_full_schema()


@router.get("/api/db/tables/{table_name}", tags=["Database Browser"])
async def db_get_table(table_name: str, limit: int = 100, offset: int = 0, q: Optional[str] = Query(None)):
    valid = await database_inspector.list_tables()
    names = {t["name"] for t in valid}
    if table_name not in names:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found.")
    return await database_inspector.get_table_data(table_name, limit=limit, offset=offset, search=q)


@router.delete("/api/db/tables/{table_name}", tags=["Database Browser"])
async def db_delete_row(table_name: str, payload: dict):
    valid = await database_inspector.list_tables()
    names = {t["name"] for t in valid}
    if table_name not in names:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found.")

    pk = (payload or {}).get("pk")
    if not isinstance(pk, dict) or not pk:
        raise HTTPException(status_code=400, detail="Body must include an object 'pk' with primary key values.")

    try:
        deleted = await database_inspector.delete_row(table_name, pk)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except IntegrityError as e:
        logger.error(f"DB delete FK violation on {table_name}: {e}")
        raise HTTPException(
            status_code=400,
            detail="Cannot delete this row — it is referenced by other records (foreign key). Delete those first.",
        )

    if not deleted:
        raise HTTPException(status_code=404, detail="Row not found.")
    return {"deleted": deleted}


@router.put("/api/db/tables/{table_name}", tags=["Database Browser"])
async def db_update_row(table_name: str, payload: dict):
    valid = await database_inspector.list_tables()
    names = {t["name"] for t in valid}
    if table_name not in names:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found.")

    pk = (payload or {}).get("pk")
    column = (payload or {}).get("column")
    value = (payload or {}).get("value")

    if not isinstance(pk, dict) or not pk:
        raise HTTPException(status_code=400, detail="Body must include an object 'pk' with primary key values.")
    if not column or not isinstance(column, str):
        raise HTTPException(status_code=400, detail="Body must include a string 'column'.")

    try:
        updated = await database_inspector.update_cell(table_name, pk, column, value)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not updated:
        raise HTTPException(status_code=404, detail="Row not found or no changes made.")
    return {"updated": updated}
