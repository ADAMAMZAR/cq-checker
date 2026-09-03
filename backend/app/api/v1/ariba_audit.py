import asyncio
import hashlib
import json
import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status

from app.models.tables import uuid7
from app.schemas import (
    AuditLogEntry,
    AuditResultResponse,
    DocumentEvidence,
    SupplierEntry,
)
from app.services import audit_data_access, auditor, extractor, storage, supplier_search
from app.services.auditor import clean_question_label
from app.services.timezones import now_malaysia

logger = logging.getLogger(__name__)
router = APIRouter()


def _first_cert(meta: dict) -> dict:
    """Return the first certificate dict from nested {"certificates": [...]} extraction output."""
    if isinstance(meta, dict):
        certs = meta.get("certificates")
        if isinstance(certs, list) and certs and isinstance(certs[0], dict):
            return certs[0]
    return meta if isinstance(meta, dict) else {}


def _wrap_cert(cert: dict) -> dict:
    """Wrap a flat certificate dict into the nested {"certificates": [...]} shape."""
    return {"certificates": [cert] if isinstance(cert, dict) else []}


def _questions_for_file(
    qa_list: list,
    filename: str,
    fallback_label: str = "General Attachment",
    fallback_answers: str = "[]",
) -> List[tuple]:
    """Return (question_label, qa_answers_json) for EVERY QA block matching filename."""
    fname_lower = (filename or "").lower()
    matches = []
    for block in qa_list or []:
        attached = (block.get("attachedFile") or "").strip().lower()
        if attached and (attached in fname_lower or fname_lower in attached):
            matches.append((
                clean_question_label(block.get("questionLabel", "General Question")),
                json.dumps(block.get("answers", [])),
            ))
    if matches:
        return matches
    return [(fallback_label, fallback_answers)]


def _cert_for_question(extracted_data: dict, target_q_label: str) -> dict:
    certs = extracted_data.get("certificates", [])
    if not certs:
        return {}
    target_norm = target_q_label.strip().lower()
    for cert in certs:
        m_label = (cert.get("matchedQuestionLabel") or "").strip().lower()
        if m_label and (m_label == target_norm or target_norm in m_label or m_label in target_norm):
            return cert
    return certs[0]


def _q_pairs_for_file(filename: str, qa_list: list) -> list:
    pairs = []
    norm_fn = filename.strip().lower()
    for item in qa_list:
        if isinstance(item, dict):
            att = item.get("attachedFile") or item.get("attached_file") or ""
            if isinstance(att, dict):
                att_name = (att.get("name") or att.get("fileName") or "").strip().lower()
            elif isinstance(att, str):
                att_name = att.strip().lower()
            else:
                att_name = ""

            q_label = item.get("questionLabel") or item.get("question_label") or "Certificate Question"
            answers = item.get("answers") or []
            if isinstance(answers, list):
                ans_str = ", ".join(
                    f"{a.get('label')}: {a.get('value')}" if isinstance(a, dict) else str(a)
                    for a in answers
                )
            elif isinstance(answers, str):
                ans_str = answers
            else:
                ans_str = "Uploaded Attachment"

            if not att_name or norm_fn in att_name or att_name in norm_fn:
                pairs.append((q_label, ans_str or "Uploaded Attachment"))

    if not pairs and qa_list:
        for item in qa_list:
            if isinstance(item, dict):
                q_label = item.get("questionLabel") or item.get("question_label") or "Certificate Question"
                answers = item.get("answers") or []
                if isinstance(answers, list):
                    ans_str = ", ".join(
                        f"{a.get('label')}: {a.get('value')}" if isinstance(a, dict) else str(a)
                        for a in answers
                    )
                else:
                    ans_str = str(answers)
                pairs.append((q_label, ans_str or "Uploaded Attachment"))

    if not pairs:
        pairs = [("Certificate Question", "Uploaded Attachment")]

    return pairs


async def _process_uploaded_files(
    supplier_name: str,
    safe_supplier_name: str,
    files: List[UploadFile],
    qa_list: list,
    temp_audit_id: str,
    timestamp: str,
):
    file_entries = []

    for file in files:
        raw = await file.read()
        content_type = file.content_type or "application/pdf"
        orig_filename = file.filename or "document"
        q_pairs = _q_pairs_for_file(orig_filename, qa_list)
        target_qa_items = [
            {"questionLabel": label, "supplierInputValue": answers}
            for label, answers in q_pairs
        ]

        fhash = hashlib.sha256(raw).hexdigest()
        cached_record = await audit_data_access.find_metadata_by_hash(fhash)
        if cached_record:
            try:
                metadata_dict = json.loads(cached_record["gemini_extracted_metadata"])
            except Exception:
                metadata_dict = {}
            task = asyncio.to_thread(lambda md=metadata_dict: (md, 0, 0, 0.0))
        else:
            task = asyncio.to_thread(
                extractor.extract_certificate_data,
                raw,
                content_type,
                None,
                target_qa_items,
            )

        f_res = await storage.store_and_record(raw, safe_supplier_name, orig_filename, content_type)
        file_url = f_res[0] if isinstance(f_res, tuple) else f_res

        file_entries.append({
            "filename": orig_filename,
            "content_type": content_type,
            "q_pairs": q_pairs,
            "file_hash": fhash,
            "file_url": file_url,
            "task": task,
        })

    extraction_results = await asyncio.gather(*[e["task"] for e in file_entries])

    doc_evidences = []
    file_contexts = []
    extracted_docs = []
    total_cost = 0.0

    for entry, (extracted_data, in_t, out_t, cost) in zip(file_entries, extraction_results):
        total_cost += cost

        for q_label, q_answers in entry["q_pairs"]:
            matched_cert = _cert_for_question(extracted_data, q_label)
            gemini_supp_name = matched_cert.get("certificateOwnerName", supplier_name)
            p_start = matched_cert.get("pageStart", 1)
            p_end = matched_cert.get("pageEnd", 1)

            question_extracted_data = {
                "certificates": [matched_cert] if matched_cert else extracted_data.get("certificates", [])
            }

            doc_evidences.append(DocumentEvidence(
                audit_id=temp_audit_id, supplier_id=0, timestamp=timestamp,
                supplier_name=supplier_name, filename=entry["filename"],
                ariba_question_label=q_label,
                ariba_qa_answers=q_answers,
                gemini_extracted_supplier_name=gemini_supp_name,
                gemini_extracted_metadata=json.dumps(question_extracted_data),
                file_content_type=entry["content_type"],
                input_tokens=in_t, output_tokens=out_t,
                cost_usd=cost,
                page_number_start=p_start,
                page_number_end=p_end,
                file_hash=entry["file_hash"], file_url=entry.get("file_url"),
            ))
            file_contexts.append({
                "filename": entry["filename"], "content_type": entry["content_type"],
                "ariba_question_label": q_label, "ariba_qa_answers": q_answers,
                "file_hash": entry["file_hash"], "file_url": entry.get("file_url"),
                "page_number_start": p_start, "page_number_end": p_end,
            })
            extracted_docs.append({
                "filename": entry["filename"], "extracted_data": question_extracted_data,
                "input_tokens": in_t, "output_tokens": out_t, "cost_usd": cost,
            })

    return doc_evidences, file_contexts, extracted_docs, total_cost


@router.get("/api/logs", response_model=List[AuditLogEntry], tags=["Supplier Audit — Read / Update"])
async def get_logs():
    return await audit_data_access.get_audit_logs()


@router.get("/api/suppliers", response_model=List[SupplierEntry], tags=["Supplier Audit — Read / Update"])
async def get_suppliers():
    return await audit_data_access.list_suppliers()


@router.get("/api/ariba/suppliers", response_model=List[SupplierEntry], tags=["Supplier Audit — Single Phase Waterfall"])
@router.post("/api/ariba/suppliers", response_model=List[SupplierEntry], tags=["Supplier Audit — Single Phase Waterfall"])
async def get_ariba_suppliers_endpoint(
    q: Optional[str] = Query(None, description="Optional search query to filter suppliers"),
    payload: Optional[Dict[str, Any]] = None,
):
    try:
        search_query = q or (payload.get("query") if payload else None)
        ariba_suppliers = await asyncio.to_thread(supplier_search.get_ariba_suppliers)
        db_suppliers = await audit_data_access.list_suppliers()
        existing_names = {s.supplier_name.strip().lower() for s in db_suppliers}

        results = []
        for idx, a_sup in enumerate(ariba_suppliers, start=1):
            s_name = a_sup.get("supplier_name", "")
            sm_id = a_sup.get("sm_vendor_id", "")
            if s_name and s_name.lower() not in existing_names:
                results.append(SupplierEntry(
                    supplier_id=idx,
                    supplier_name=s_name,
                    sm_vendor_id=sm_id,
                    created_at=now_malaysia().strftime("%Y-%m-%d %H:%M:%S"),
                ))
                existing_names.add(s_name.lower())

        if search_query and search_query.strip():
            query_str = search_query.strip().lower()
            results = [
                s for s in results 
                if query_str in s.supplier_name.lower() or (s.sm_vendor_id and query_str in s.sm_vendor_id.lower())
            ]

        return results
    except Exception as e:
        logger.error(f"Error fetching Ariba suppliers: {e}")
        return []


@router.get("/api/ariba/suppliers/{sm_vendor_id}/questionnaires", tags=["Supplier Audit — Single Phase Waterfall"])
async def get_ariba_questionnaires_endpoint(sm_vendor_id: str):
    if not sm_vendor_id.strip():
        raise HTTPException(status_code=400, detail="SM Vendor ID cannot be empty.")
    try:
        token = await asyncio.to_thread(supplier_search.get_oauth_token)
        questionnaires = await asyncio.to_thread(supplier_search.get_all_questionnaires, token, sm_vendor_id)
        return {
            "status": "success",
            "sm_vendor_id": sm_vendor_id,
            "total": len(questionnaires),
            "questionnaires": questionnaires,
        }
    except Exception as e:
        logger.error(f"Error fetching Ariba questionnaires for vendor {sm_vendor_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/ariba/suppliers/{sm_vendor_id}/questionnaires/{doc_id}/answers", tags=["Supplier Audit — Single Phase Waterfall"])
async def get_ariba_questionnaire_answers_endpoint(sm_vendor_id: str, doc_id: str):
    if not sm_vendor_id.strip() or not doc_id.strip():
        raise HTTPException(status_code=400, detail="Vendor ID and Document ID are required.")
    try:
        token = await asyncio.to_thread(supplier_search.get_oauth_token)
        answers = await asyncio.to_thread(supplier_search.get_questionnaire_answers, token, sm_vendor_id, doc_id)
        return {
            "status": "success",
            "sm_vendor_id": sm_vendor_id,
            "doc_id": doc_id,
            "qna_data": answers,
        }
    except Exception as e:
        logger.error(f"Error fetching Q&A answers for vendor {sm_vendor_id}, doc {doc_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/ariba/suppliers/{sm_vendor_id}/questionnaires/{doc_id}/download-attachments", tags=["Supplier Audit — Single Phase Waterfall"])
async def download_ariba_attachments_endpoint(sm_vendor_id: str, doc_id: str):
    if not sm_vendor_id.strip() or not doc_id.strip():
        raise HTTPException(status_code=400, detail="Vendor ID and Document ID are required.")
    try:
        token = await asyncio.to_thread(supplier_search.get_oauth_token)
        result = await asyncio.to_thread(
            supplier_search.download_certified_attachments_for_questionnaire,
            token,
            sm_vendor_id,
            doc_id
        )
        return result
    except Exception as e:
        logger.error(f"Error downloading attachments for vendor {sm_vendor_id}, doc {doc_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/audit/ariba-supplier", tags=["Supplier Audit — Single Phase Waterfall"])
async def audit_ariba_supplier_endpoint(sm_vendor_id: str, doc_id: Optional[str] = None):
    if not sm_vendor_id.strip():
        raise HTTPException(status_code=400, detail="SM Vendor ID cannot be empty.")
    try:
        res = await supplier_search.run_ariba_2stage_audit_pipeline(sm_vendor_id, doc_id)
        return res
    except Exception as e:
        logger.error(f"Error auditing Ariba supplier {sm_vendor_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/audit", response_model=AuditResultResponse, tags=["Supplier Audit — Full Run & Comparison"])
async def run_audit(
    supplier_name: str = Form(...),
    supplier_folder: Optional[str] = Form(None),
    workspace_title: str = Form(...),
    cert_type: Optional[str] = Form(None),
    qa_data: str = Form(...),
    files: List[UploadFile] = File(...),
    screenshot: Optional[UploadFile] = File(None)
):
    if not supplier_name.strip():
        raise HTTPException(status_code=400, detail="Supplier name cannot be empty.")
    if not files:
        raise HTTPException(status_code=400, detail="At least one certificate file must be provided.")

    safe_supplier_name = supplier_folder or "".join(c for c in supplier_name if c.isalnum() or c in (" ", "_", "-")).strip()

    screenshot_url = None
    if screenshot:
        screenshot_filename = f"screenshot_{now_malaysia().strftime('%Y%m%d_%H%M%S')}.png"
        screenshot_bytes = screenshot.file.read()
        screenshot.file.seek(0)
        res = await storage.store_and_record(
            screenshot_bytes, safe_supplier_name, screenshot_filename, "image/png"
        )
        screenshot_url = res[0] if isinstance(res, tuple) else res

    temp_audit_id = f"TEMP_{uuid7()}"
    timestamp = now_malaysia().strftime("%d/%m/%Y, %H:%M:%S")

    try:
        qa_list = json.loads(qa_data)
        if isinstance(qa_list, dict):
            qa_list = [qa_list]
        elif not isinstance(qa_list, list):
            qa_list = []
    except Exception:
        qa_list = []

    doc_evidences, file_contexts, extracted_docs, total_extraction_cost = await _process_uploaded_files(
        supplier_name, safe_supplier_name, files, qa_list, temp_audit_id, timestamp,
    )

    all_filenames = [d.filename for d in doc_evidences]

    qa_data_title = f"{workspace_title} {cert_type or ''}".strip()
    audit_result, suggested_comment, comparison_table_dict = auditor.run_full_audit(
        supplier_name,
        file_contexts,
        [d["extracted_data"] for d in extracted_docs],
        qa_data_title=qa_data_title,
    )

    comp_in_t = 0
    comp_out_t = 0
    comp_cost = 0.0
    total_run_cost = total_extraction_cost + comp_cost

    audit_log = AuditLogEntry(
        audit_id=temp_audit_id,
        supplier_id=0,
        timestamp=timestamp,
        supplier_name=supplier_name,
        workspace_title=workspace_title,
        complete_qa_data_dump=qa_data,
        compiled_extracted_data=json.dumps(extracted_docs),
        result=audit_result,
        suggested_comment=suggested_comment,
        screenshot_url=screenshot_url,
        comparison_input_tokens=0,
        comparison_output_tokens=0,
        comparison_cost_usd=0.0,
        total_run_cost_usd=total_run_cost,
        comparison_table=comparison_table_dict,
    )

    resolved_audit_id = await audit_data_access.log_audit_run(supplier_name, doc_evidences, audit_log)
    supplier_id = doc_evidences[0].supplier_id if doc_evidences else 0

    if not resolved_audit_id:
        resolved_audit_id = temp_audit_id
        suggested_comment += " (Warning: Neon database log failed)"

    return AuditResultResponse(
        audit_id=resolved_audit_id,
        supplier_id=supplier_id,
        supplier_name=supplier_name,
        workspace_title=workspace_title,
        cert_type=cert_type,
        filename=", ".join(all_filenames),
        result=audit_result,
        suggested_comment=suggested_comment,
        screenshot_url=screenshot_url,
        comparison_input_tokens=comp_in_t,
        comparison_output_tokens=comp_out_t,
        comparison_cost_usd=comp_cost,
        total_run_cost_usd=total_run_cost,
        comparison_table=comparison_table_dict,
    )


@router.get("/api/logs/{supplier_id}/evidence", tags=["Supplier Audit — Read / Update"])
async def get_supplier_evidence(supplier_id: int):
    screenshots = await audit_data_access.get_screenshot_urls_by_supplier_id(supplier_id)
    documents = await audit_data_access.get_evidence_urls_by_supplier_id(supplier_id)
    return {"screenshots": screenshots, "documents": documents}
