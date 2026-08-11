import sys
# Force python to raise ImportError when attempting to load the incompatible C-extension
sys.modules['google._upb._message'] = None

import os
# Force pure Python implementation of Protobuf to bypass Python 3.14 C-extension incompatibilities
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

import hashlib
import json
import asyncio
import logging
import requests
import uuid
from app.models.tables import uuid7
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse

from app.config import settings
from app.schemas import (
    SupplierEntry, AuditLogEntry, AuditResultResponse, DocumentEvidence, UpdateEvidenceRequest,
    AuditRegistryEntry, CertificateVerificationResponse, CertificateVerifyResult,
    DocumentIngestResult, DocumentSummary, ChatRequest, ChatResponse, ChatSource,
    ChatHistoryResponse,
)
from app.services import audit_data_access, extractor, storage, supplier_search
from app.services import auditor
from app.services.auditor import clean_question_label
from app.services.timezones import now_malaysia, to_malaysia

logger = logging.getLogger(__name__)


def _first_cert(meta: dict) -> dict:
    """Return the first certificate dict from nested ``{"certificates": [...]}``
    extraction output, or the dict itself when it is already a flat single cert."""
    if isinstance(meta, dict):
        certs = meta.get("certificates")
        if isinstance(certs, list) and certs and isinstance(certs[0], dict):
            return certs[0]
    return meta if isinstance(meta, dict) else {}


def _wrap_cert(cert: dict) -> dict:
    """Wrap a flat certificate dict into the nested ``{"certificates": [...]}`` shape."""
    return {"certificates": [cert] if isinstance(cert, dict) else []}


def _questions_for_file(
    qa_list: list,
    filename: str,
    fallback_label: str = "General Attachment",
    fallback_answers: str = "[]",
) -> List[tuple]:
    """Return ``(question_label, qa_answers_json)`` for EVERY QA block whose
    attachedFile matches the given filename. A merged file attached to several
    questions yields several pairs so each question gets audited. Falls back to
    one default pair when the file is not referenced by any question."""
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

API_TAGS = [
    {"name": "System / Health", "description": "Service health check."},
    {"name": "Supplier Audit — Full Run & Comparison", "description": "Gemini extraction — full audit run and comparison phase."},
    {"name": "Supplier Audit — Read / Update", "description": "Legacy audit logs, registry, evidence, and supplier assets."},
    {"name": "Cost Analytics", "description": "Aggregated cost/usage analytics across audits."},
    {"name": "Certificate Verification", "description": "Phase 4 — Gemini extraction + deterministic rules pipeline."},
    {"name": "Document Ingestion / RAG", "description": "Phase 5 — manual ingestion: parse, chunk, embed, store."},
    {"name": "RAG Chatbot", "description": "Phase 6 — semantic cache + hybrid retrieval + Gemini generation."},
    {"name": "File Serving", "description": "Serve uploaded files (local disk and legacy Supabase proxy)."},
]

app = FastAPI(
    title="GPO Automatic Certificate Auditor API",
    description="Backend API for auditing certificates and logging results to Neon PostgreSQL",
    version="1.0.0",
    openapi_tags=API_TAGS,
)

# Configure CORS so the Chrome Extension and Next.js can connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/", tags=["System / Health"])
def read_root():
    return {"status": "healthy", "service": "GPO Automatic Certificate Auditor API"}

async def _process_uploaded_files(
    supplier_name: str,
    safe_supplier_name: str,
    files: List[UploadFile],
    qa_list: list,
    temp_audit_id: str,
    timestamp: str,
):
    """
    Single-pass file processing: read -> hash -> upload -> one Gemini extraction
    per unique file -> one context per (file, question) so every question that
    references a file is audited. Returns (doc_evidences, file_contexts,
    extracted_docs, total_extraction_cost).
    """
    file_entries = []

    for file in files:
        raw = await file.read()
        content_type = file.content_type or "application/pdf"
        orig_filename = file.filename or "document"
        q_pairs = _questions_for_file(qa_list, orig_filename)

        fhash = hashlib.sha256(raw).hexdigest()
        cached_record = await audit_data_access.find_metadata_by_hash(fhash)
        if cached_record:
            try:
                metadata_dict = json.loads(cached_record["gemini_extracted_metadata"])
            except Exception:
                metadata_dict = {}
            task = asyncio.to_thread(lambda md=metadata_dict: (md, 0, 0, 0.0))
        else:
            task = asyncio.to_thread(extractor.extract_certificate_data, raw, content_type)

        file_url = await storage.store_and_record(raw, safe_supplier_name, orig_filename, content_type)

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
        gemini_supp_name = _first_cert(extracted_data).get("certificateOwnerName", supplier_name)
        total_cost += cost

        # One evidence record per (file, question) so a merged file attached to
        # several questions is fully represented in the database.
        for q_label, q_answers in entry["q_pairs"]:
            doc_evidences.append(DocumentEvidence(
                audit_id=temp_audit_id, supplier_id=0, timestamp=timestamp,
                supplier_name=supplier_name, filename=entry["filename"],
                ariba_question_label=q_label,
                ariba_qa_answers=q_answers,
                gemini_extracted_supplier_name=gemini_supp_name,
                gemini_extracted_metadata=json.dumps(extracted_data),
                file_content_type=entry["content_type"],
                input_tokens=in_t, output_tokens=out_t,
                cost_usd=cost,
                file_hash=entry["file_hash"], file_url=entry.get("file_url"),
            ))
            file_contexts.append({
                "filename": entry["filename"], "content_type": entry["content_type"],
                "ariba_question_label": q_label, "ariba_qa_answers": q_answers,
                "file_hash": entry["file_hash"], "file_url": entry.get("file_url"),
            })
            extracted_docs.append({
                "filename": entry["filename"], "extracted_data": extracted_data,
                "input_tokens": in_t, "output_tokens": out_t, "cost_usd": cost,
            })

    return doc_evidences, file_contexts, extracted_docs, total_cost


@app.get("/api/logs", response_model=List[AuditLogEntry], tags=["Supplier Audit — Read / Update"])
async def get_logs():
    """
    Fetches all historical audit logs from Neon.
    """
    logs = await audit_data_access.get_audit_logs()
    return logs

@app.get("/api/suppliers", response_model=List[SupplierEntry], tags=["Supplier Audit — Read / Update"])
async def get_suppliers():
    """
    Fetches the list of all registered suppliers from DB.
    """
    return await audit_data_access.list_suppliers()


@app.get("/api/ariba/suppliers", response_model=List[SupplierEntry], tags=["Supplier Audit — Single Phase Waterfall"])
async def get_ariba_suppliers_endpoint():
    """
    Fetches live Ariba Step 1 suppliers ('InQualification' status) via app.services.supplier_search.
    Excludes suppliers that have already been audited and saved to DB.
    """
    try:
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
        return results
    except Exception as e:
        logger.error(f"Error fetching Ariba suppliers: {e}")
        return []


@app.post("/api/audit/ariba-supplier", tags=["Supplier Audit — Single Phase Waterfall"])
async def audit_ariba_supplier_endpoint(sm_vendor_id: str):
    """
    Executes Ariba Step 2 (get docId) and Step 3 (extract Q&A answers).
    Triggered when the user selects an Ariba supplier and clicks 'Audit' in the Audit Tab.
    """
    try:
        res = await asyncio.to_thread(supplier_search.audit_ariba_supplier, sm_vendor_id)
        return res
    except Exception as e:
        logger.error(f"Error auditing Ariba supplier {sm_vendor_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/audit-registry", response_model=List[AuditRegistryEntry], tags=["Supplier Audit — Read / Update"])
async def get_audit_registry():
    """
    Consolidated audit registry with supplier info, result, and document counts.
    """
    return await audit_data_access.get_audit_registry()

@app.get("/api/evidence", response_model=List[DocumentEvidence], tags=["Supplier Audit — Read / Update"])
async def get_evidence():
    """
    Fetches all historical document evidence logs (extracted file details) from Neon.
    """
    evidence = await audit_data_access.get_document_evidence_logs()
    return evidence

@app.put("/api/evidence", tags=["Supplier Audit — Read / Update"])
async def update_evidence(payload: UpdateEvidenceRequest):
    """
    Updates the extracted certificate details (JSON metadata) for a specific document evidence
    record identified by its Audit ID and Filename, and re-runs the comparison table audit.
    Computation happens BEFORE any DB mutation — returns 500 if verdict cannot be computed.
    """
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




@app.post("/api/audit", response_model=AuditResultResponse, tags=["Supplier Audit — Full Run & Comparison"])
async def run_audit(
    supplier_name: str = Form(...),
    supplier_folder: Optional[str] = Form(None),
    workspace_title: str = Form(...),
    cert_type: str = Form(...),
    qa_data: str = Form(...),
    files: List[UploadFile] = File(...),
    screenshot: Optional[UploadFile] = File(None)
):
    """
    Main endpoint called by the Chrome Extension.
    Runs single-pass file processing, then runs the code-based auditor comparison
    and records results in Neon PostgreSQL.
    """
    safe_supplier_name = supplier_folder or "".join(c for c in supplier_name if c.isalnum() or c in (" ", "_", "-")).strip()

    screenshot_url = None
    if screenshot:
        screenshot_filename = f"screenshot_{now_malaysia().strftime('%Y%m%d_%H%M%S')}.png"
        screenshot_bytes = screenshot.file.read()
        screenshot.file.seek(0)
        screenshot_url = await storage.store_and_record(
            screenshot_bytes, safe_supplier_name, screenshot_filename, "image/png"
        )

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

    qa_data_title = f"{workspace_title} {cert_type}"
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
        cert_type=cert_type,
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

@app.get("/api/costs", tags=["Cost Analytics"])
async def get_cost_analytics():
    return await audit_data_access.get_cost_analytics()


@app.post("/api/certificates/verify", response_model=CertificateVerifyResult, tags=["Certificate Verification"])
async def verify_certificate(
    file: UploadFile = File(...),
    supplier_name: str = Form(...),
    question_label: Optional[str] = Form(None),
    qa_answers: Optional[str] = Form("[]"),
    qa_data_title: Optional[str] = Form(""),
):
    """
    Phase 4 pipeline: upload a certificate PDF/image -> Gemini extraction ->
    deterministic rules -> save to certificate_verifications -> return verdict + reasoning.
    Idempotent by file SHA-256: re-uploading the same file returns the prior
    verdict with zero LLM cost.
    """
    from app.services import extractor
    from app.services.rules import verify_document, _derive_status_from_rules
    from app.db.session import get_session_factory
    from app.repositories.certificates import CertificateRepository

    file_bytes = await file.read()
    mime_type = file.content_type or "application/pdf"
    filename = file.filename or "certificate"
    file_hash = hashlib.sha256(file_bytes).hexdigest()

    file_url, object_id = await storage.store_and_record(file_bytes, supplier_name, filename, mime_type)

    # Dedup: if the exact same bytes were verified before, return the prior verdict.
    factory = get_session_factory()
    async with factory() as session:
        repo = CertificateRepository(session)
        existing = await repo.get_by_hash(file_hash)
        if existing:
            confidence = None
            if isinstance(existing.extracted_data, dict):
                confidence = existing.extracted_data.get("confidence")
            return CertificateVerifyResult(
                status=existing.status,
                extracted_data=existing.extracted_data,
                reasoning_trace=existing.reasoning_trace or "",
                confidence=float(confidence) if confidence is not None else None,
                record_id=str(existing.id),
            )

    # 1. Extract
    extracted_data, in_t, out_t, cost = extractor.extract_certificate_data(
        file_bytes, mime_type, question_label,
    )
    certs = extracted_data.get("certificates")
    if not certs or certs[0].get("certificateOwnerName") == "Extraction Failed":
        raise HTTPException(status_code=502, detail="Certificate extraction failed.")

    # 2. Deterministic rules verdict per certificate, aggregated worst-wins (no LLM judge)
    def _rule_payload(r):
        return {
            "verdict": r.verdict,
            "region": r.region,
            "category": r.category,
            "intercept_type": r.intercept_type,
            "expiry_status": r.expiry_status,
            "reasons": r.reasons[:10],
            "comparison_rows": r.comparison_rows,
        }

    per_cert = []
    for idx, cert in enumerate(certs, start=1):
        rule = verify_document(
            cert,
            supplier_name,
            ariba_question_label=question_label,
            ariba_qa_answers=qa_answers,
            qa_data_title=qa_data_title,
        )
        per_cert.append({
            "index": idx,
            "status": _derive_status_from_rules(rule),
            "rule_result": _rule_payload(rule),
            "reasons": rule.reasons[:8],
        })

    statuses = [pc["status"] for pc in per_cert]
    if "FAIL" in statuses:
        status = "FAIL"
    elif "REQUIRES_HUMAN_REVIEW" in statuses:
        status = "REQUIRES_HUMAN_REVIEW"
    else:
        status = "PASS"

    trace_parts = ["Deterministic rules only."]
    for pc in per_cert:
        trace_parts.append(f"Certificate {pc['index']}: " + "; ".join(pc["reasons"]))
    reasoning_trace = " ".join(trace_parts)
    confidence = 0.9 if status == "PASS" else 0.7
    rule_payload = {"overall": status, "certificates": [pc["rule_result"] for pc in per_cert]}

    # 3. Persist
    record_id = None
    async with factory() as session:
        repo = CertificateRepository(session)
        record = await repo.create(
            extracted_data={**extracted_data, "confidence": confidence},
            status=status,
            reasoning_trace=reasoning_trace,
            object_id=object_id,
        )
        record_id = str(record.id)

    return CertificateVerifyResult(
        status=status,
        extracted_data=extracted_data,
        reasoning_trace=reasoning_trace,
        confidence=confidence,
        rule_result=rule_payload,
        record_id=record_id,
    )


@app.get("/api/certificates", response_model=List[CertificateVerificationResponse], tags=["Certificate Verification"])
async def list_certificates(limit: int = 50, offset: int = 0):
    """
    List past certificate verifications from certificate_verifications.
    """
    from app.db.session import get_session_factory
    from app.repositories.certificates import CertificateRepository

    factory = get_session_factory()
    async with factory() as session:
        repo = CertificateRepository(session)
        records = await repo.list_all(limit=limit, offset=offset)

    results = []
    for r in records:
        confidence = None
        if isinstance(r.extracted_data, dict):
            confidence = r.extracted_data.get("confidence")
        results.append(CertificateVerificationResponse(
            id=str(r.id),
            file_url=r.file_url,
            extracted_data=r.extracted_data,
            status=r.status,
            reasoning_trace=r.reasoning_trace,
            confidence=float(confidence) if confidence is not None else None,
            created_at=to_malaysia(r.created_at).strftime("%d/%m/%Y, %H:%M:%S") if r.created_at else None,
        ))
    return results


@app.post("/api/documents/upload", response_model=DocumentIngestResult, tags=["Document Ingestion / RAG"])
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
):
    """
    Phase 5: upload a manual PDF -> parse -> chunk -> embed -> store in Neon.
    Returns document_id + parent/child counts. Idempotent by file hash.
    """
    from app.services.ingest import ingest_document

    file_bytes = await file.read()
    filename = file.filename or "manual.pdf"
    content_type = file.content_type or "application/pdf"
    doc_title = title or filename

    result = await ingest_document(file_bytes, doc_title, filename, content_type)
    if result.status == "failed":
        raise HTTPException(status_code=502, detail=result.message)
    return DocumentIngestResult(**result.to_dict())


@app.get("/api/documents", response_model=List[DocumentSummary], tags=["Document Ingestion / RAG"])
async def list_documents(limit: int = 50, offset: int = 0):
    """
    List ingested documents with page counts.
    """
    from app.db.session import get_session_factory
    from app.repositories.documents import DocumentRepository, PageRepository

    factory = get_session_factory()
    async with factory() as session:
        doc_repo = DocumentRepository(session)
        page_repo = PageRepository(session)
        docs = await doc_repo.list_all(limit=limit, offset=offset)

        summaries = []
        for doc in docs:
            counts = await page_repo.count_by_document(doc.id)
            p_cnt = counts.get("page_count", 0)
            summaries.append(DocumentSummary(
                id=str(doc.id),
                title=doc.title,
                file_url=doc.file_url,
                page_count=p_cnt,
                parent_count=p_cnt,
                child_count=p_cnt,
                created_at=to_malaysia(doc.created_at).strftime("%d/%m/%Y, %H:%M:%S") if doc.created_at else None,
            ))
    return summaries


@app.post("/api/chat", response_model=ChatResponse, tags=["RAG Chatbot"])
async def chat(payload: ChatRequest):
    """
    Phase 6: RAG chatbot query. Semantic cache -> hybrid retrieval -> Gemini
    generation. Multi-turn aware via session_id. Set `stream: true` for an SSE
    streaming answer; otherwise returns the full JSON response.
    """
    from app.services import rag

    if payload.stream:
        async def event_stream():
            try:
                async for event in rag.answer_query_stream(
                    payload.query, session_id=payload.session_id
                ):
                    yield f"data: {json.dumps(event)}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                yield "data: [DONE]\n\n"

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    result = await rag.answer_query(payload.query, session_id=payload.session_id)
    return ChatResponse(
        answer=result["answer"],
        sources=[ChatSource(**s) for s in result["sources"]],
        cost_usd=result["cost_usd"],
        cache_hit=result["cache_hit"],
        session_id=result["session_id"],
    )


@app.post("/api/chat/cache/clear", tags=["RAG Chatbot"])
async def clear_chat_cache():
    """
    Admin: clear the semantic query cache. Returns count cleared.
    """
    from app.services import rag

    count = await rag.clear_cache()
    return {"status": "success", "cleared": count}


@app.get("/api/chat/history", response_model=ChatHistoryResponse, tags=["RAG Chatbot"])
async def chat_history(session_id: str):
    """
    Return conversation history for a session.
    """
    from app.services import rag

    messages = await rag.get_history(session_id)
    return ChatHistoryResponse(session_id=session_id, messages=messages)


@app.get("/api/logs/{supplier_id}/evidence", tags=["Supplier Audit — Read / Update"])
async def get_supplier_evidence(supplier_id: int):
    """
    Returns documents and screenshots for a supplier via file_urls in the DB.
    """
    screenshots = await audit_data_access.get_screenshot_urls_by_supplier_id(supplier_id)
    documents = await audit_data_access.get_evidence_urls_by_supplier_id(supplier_id)
    return {"screenshots": screenshots, "documents": documents}


MAX_PROXY_FILE_SIZE = 50 * 1024 * 1024  # 50 MB





@app.get("/api/files/local/{folder}/{filename}", tags=["File Serving"])
def serve_local_file(folder: str, filename: str):
    """
    Serves files uploaded to the local disk storage provider (dev).
    Path traversal is prevented by resolving inside UPLOAD_DIR.
    """
    from urllib.parse import unquote
    safe_folder = unquote(folder)
    safe_name = unquote(filename)

    import os
    root = os.path.abspath(settings.upload_dir)
    file_path = os.path.realpath(os.path.join(root, safe_folder, safe_name))
    if not file_path.startswith(root + os.sep) or not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Not found.")

    stat = os.stat(file_path)
    if stat.st_size > MAX_PROXY_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large.")

    import mimetypes
    content_type = mimetypes.guess_type(safe_name)[0] or "application/octet-stream"
    with open(file_path, "rb") as f:
        body = f.read()
    return Response(content=body, media_type=content_type,
                    headers={
                        "Content-Disposition": f'inline; filename="{safe_name}"',
                        "Access-Control-Allow-Origin": "*",
                    })


# ── Read-only Database Browser (preview) ──────────────────────────────────────

@app.get("/api/db/tables", tags=["Database Browser"])
async def db_list_tables():
    """
    Read-only: list all public tables with row counts. No writes exposed.
    """
    from app.services import database_inspector
    return await database_inspector.list_tables()


@app.get("/api/db/schema", tags=["Database Browser"])
async def db_get_schema():
    """
    Read-only: return the full public schema for the Schema Viewer page.

    Each table carries its columns (with type, nullable, default, PK/FK
    flags, and FK references), primary-key columns, and non-PK index names.
    A flat list of FK relationships is also returned for drawing edges.
    No row data is touched.
    """
    from app.services import database_inspector
    return await database_inspector.get_full_schema()


@app.get("/api/db/tables/{table_name}", tags=["Database Browser"])
async def db_get_table(table_name: str, limit: int = 100, offset: int = 0):
    """
    Read-only: return a page of rows for a table (validated against the
    whitelist from information_schema). `limit` is clamped to 500.
    """
    from app.services import database_inspector

    valid = await database_inspector.list_tables()
    names = {t["name"] for t in valid}
    if table_name not in names:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found.")
    return await database_inspector.get_table_data(table_name, limit=limit, offset=offset)


@app.delete("/api/db/tables/{table_name}", tags=["Database Browser"])
async def db_delete_row(table_name: str, payload: dict):
    """
    Delete a single row identified by its primary key.

    Body: ``{"pk": {"<primary_key_column>": "<value>", ...}}``. The table name is
    validated against the whitelist. Fails with 400 when the row is referenced
    by other records (foreign key) or the primary key values are incomplete.
    """
    from sqlalchemy.exc import IntegrityError
    from app.services import database_inspector

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


