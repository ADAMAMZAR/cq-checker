import sys
# Force python to raise ImportError when attempting to load the incompatible C-extension
sys.modules['google._upb._message'] = None

import os
# Force pure Python implementation of Protobuf to bypass Python 3.14 C-extension incompatibilities
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

import hashlib
import json
import asyncio
import requests
import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.config import settings
from app.schemas import (
    AuditLogEntry, AuditResultResponse, DocumentEvidence, UpdateEvidenceRequest,
    AuditRegistryEntry, CertificateVerificationResponse, CertificateVerifyResult,
    DocumentIngestResult, DocumentSummary,
)
from app.services import audit_data, gemini, storage
from app.services import auditor
from app.services.gemini import clean_question_label

app = FastAPI(
    title="GPO Automatic Certificate Auditor API",
    description="Backend API for auditing certificates and logging results to Neon PostgreSQL",
    version="1.0.0"
)

# Configure CORS so the Chrome Extension and Next.js can connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
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
    Single-pass file processing: read -> match -> hash -> upload -> dispatch Gemini.
    Returns (doc_evidences, file_contexts, extracted_docs, total_extraction_cost).
    """
    file_tasks = []
    file_contexts = []

    qa_attachments = {}
    for block in qa_list:
        attached = block.get("attachedFile", "").strip().lower()
        if attached and attached not in qa_attachments:
            q_label = clean_question_label(block.get("questionLabel", "General Question"))
            q_answers = json.dumps(block.get("answers", []))
            qa_attachments[attached] = (q_label, q_answers)

    for file in files:
        raw = await file.read()
        fname_lower = file.filename.lower() if file.filename else ""
        content_type = file.content_type or "application/pdf"
        orig_filename = file.filename or "document"

        q_label = "General Attachment"
        q_answers = "[]"
        for attached_name, (ql, qa) in qa_attachments.items():
            if attached_name in fname_lower or fname_lower in attached_name:
                q_label = ql
                q_answers = qa
                break

        fhash = hashlib.sha256(raw).hexdigest()
        cached_record = await audit_data.find_metadata_by_hash(fhash, q_label)
        if cached_record:
            try:
                metadata_dict = json.loads(cached_record["gemini_extracted_metadata"])
            except Exception:
                metadata_dict = {}
            task = asyncio.to_thread(lambda md=metadata_dict: (md, 0, 0, 0.0))
        else:
            task = asyncio.to_thread(gemini.extract_certificate_data, raw, content_type, q_label)

        file_url = storage.get_storage().upload(raw, safe_supplier_name, orig_filename, content_type)

        file_contexts.append({
            "filename": orig_filename, "content_type": content_type,
            "ariba_question_label": q_label, "ariba_qa_answers": q_answers,
            "file_hash": fhash, "file_url": file_url,
        })
        file_tasks.append(task)

    extraction_results = await asyncio.gather(*file_tasks)

    doc_evidences = []
    extracted_docs = []
    total_cost = 0.0

    for ctx, (extracted_data, in_t, out_t, cost) in zip(file_contexts, extraction_results):
        gemini_supp_name = extracted_data.get("certificateOwnerName", supplier_name)
        total_cost += cost
        extracted_docs.append({
            "filename": ctx["filename"], "extracted_data": extracted_data,
            "input_tokens": in_t, "output_tokens": out_t, "cost_usd": cost,
        })
        doc_evidences.append(DocumentEvidence(
            audit_id=temp_audit_id, supplier_id=0, timestamp=timestamp,
            supplier_name=supplier_name, filename=ctx["filename"],
            ariba_question_label=ctx["ariba_question_label"],
            ariba_qa_answers=ctx["ariba_qa_answers"],
            gemini_extracted_supplier_name=gemini_supp_name,
            gemini_extracted_metadata=json.dumps(extracted_data),
            file_content_type=ctx["content_type"],
            input_tokens=in_t, output_tokens=out_t,
            cost_usd=cost,
            file_hash=ctx["file_hash"], file_url=ctx.get("file_url"),
        ))

    return doc_evidences, file_contexts, extracted_docs, total_cost


@app.get("/api/logs", response_model=List[AuditLogEntry])
async def get_logs():
    """
    Fetches all historical audit logs from Neon.
    """
    logs = await audit_data.get_audit_logs()
    return logs

@app.get("/api/audit-registry", response_model=List[AuditRegistryEntry])
async def get_audit_registry():
    """
    Consolidated audit registry with supplier info, result, and document counts.
    """
    return await audit_data.get_audit_registry()

@app.get("/api/evidence", response_model=List[DocumentEvidence])
async def get_evidence():
    """
    Fetches all historical document evidence logs (extracted file details) from Neon.
    """
    evidence = await audit_data.get_document_evidence_logs()
    return evidence

@app.put("/api/evidence")
async def update_evidence(payload: UpdateEvidenceRequest):
    """
    Updates the extracted certificate details (JSON metadata) for a specific document evidence
    record identified by its Audit ID and Filename, and re-runs the comparison table audit.
    Computation happens BEFORE any DB mutation — returns 500 if verdict cannot be computed.
    """
    matching_docs = await audit_data.get_document_evidence_logs(audit_id=payload.audit_id)
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
            "ariba_question_label": gemini.clean_question_label(doc.ariba_question_label),
            "ariba_qa_answers": doc.ariba_qa_answers,
        })
        if doc.filename == payload.filename:
            extracted_results.append(payload.updated_metadata)
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

    success = await audit_data.update_document_evidence(
        audit_id=payload.audit_id,
        filename=payload.filename,
        updated_metadata=payload.updated_metadata,
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save updated metadata."
        )

    await audit_data.update_audit_result(
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

@app.post("/api/test/extract")
async def test_extract_file(file: UploadFile = File(...)):
    """
    Test endpoint to upload a file and return raw Gemini OCR extraction data (JSON).
    """
    file_bytes = await file.read()
    mime_type = file.content_type or "application/pdf"
    
    extracted_data, in_t, out_t, cost = gemini.extract_certificate_data(file_bytes, mime_type)
    return {
        "extracted_data": extracted_data,
        "usage": {
            "input_tokens": in_t,
            "output_tokens": out_t,
            "estimated_cost_usd": cost
        }
    }

@app.post("/api/extract")
async def extract_documents(
    supplier_name: str = Form(...),
    supplier_folder: Optional[str] = Form(None),
    workspace_title: str = Form(...),
    cert_type: str = Form(...),
    qa_data: str = Form(...),
    files: List[UploadFile] = File(...),
    screenshot: Optional[UploadFile] = File(None)
):
    """
    Phase 1 endpoint called by the Chrome Extension.
    Runs single-pass file processing (read -> match -> hash -> upload -> Gemini),
    saves DocumentEvidence to database, and returns audit_id for the comparison phase.
    """
    safe_supplier_name = supplier_folder or "".join(c for c in supplier_name if c.isalnum() or c in (" ", "_", "-")).strip()

    screenshot_url = None
    if screenshot:
        screenshot_filename = f"screenshot_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
        screenshot_bytes = screenshot.file.read()
        screenshot.file.seek(0)
        screenshot_url = storage.get_storage().upload(
            screenshot_bytes, safe_supplier_name, screenshot_filename, "image/png"
        )

    temp_audit_id = f"TEMP_{uuid.uuid4()}"
    timestamp = datetime.now().strftime("%d/%m/%Y, %H:%M:%S")

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

    resolved_audit_id = await audit_data.log_audit_run(supplier_name, doc_evidences, None)
    if not resolved_audit_id:
        resolved_audit_id = temp_audit_id

    return {
        "audit_id": resolved_audit_id,
        "supplier_name": supplier_name,
        "workspace_title": workspace_title,
        "cert_type": cert_type,
        "qa_data": qa_data,
        "screenshot_url": screenshot_url,
        "timestamp": timestamp,
        "file_count": len(doc_evidences),
        "total_extraction_cost_usd": total_extraction_cost,
    }


@app.post("/api/audit/comparison", response_model=AuditResultResponse)
async def run_audit_comparison(
    audit_id: str = Form(...),
    supplier_name: str = Form(...),
    workspace_title: str = Form(...),
    cert_type: str = Form(...),
    qa_data: str = Form(...),
    screenshot_url: Optional[str] = Form(None),
    timestamp: str = Form(...)
):
    """
    Phase 2 endpoint called by the Chrome Extension after extraction.
    Loads document evidence from DB by audit_id, runs the code-based auditor comparison,
    saves the full audit log including results, and returns the verdict.
    """
    matching_docs = await audit_data.get_document_evidence_logs(audit_id=audit_id)

    file_contexts = []
    extracted_results = []

    for doc in matching_docs:
        file_contexts.append({
            "filename": doc.filename,
            "ariba_question_label": gemini.clean_question_label(doc.ariba_question_label),
            "ariba_qa_answers": doc.ariba_qa_answers
        })
        try:
            meta = json.loads(doc.gemini_extracted_metadata)
        except Exception:
            meta = {}
        extracted_results.append(meta)

    expiration_date = "N/A"
    if extracted_results:
        expiration_date = extracted_results[0].get("expirationDate", "N/A")

    qa_data_title = f"{workspace_title} {cert_type}"
    audit_result, suggested_comment, comparison_table_dict = auditor.run_full_audit(
        supplier_name,
        file_contexts,
        extracted_results,
        qa_data_title=qa_data_title,
    )

    total_run_cost = sum(
        doc.input_tokens * 0.10 / 1_000_000 + doc.output_tokens * 0.40 / 1_000_000
        for doc in matching_docs
    )
    compiled_data = json.dumps([
        {"filename": fc["filename"], "extracted_data": er}
        for fc, er in zip(file_contexts, extracted_results)
    ])

    audit_log = AuditLogEntry(
        audit_id=audit_id,
        supplier_id=0,
        timestamp=timestamp,
        supplier_name=supplier_name,
        workspace_title=workspace_title,
        cert_type=cert_type,
        complete_qa_data_dump=qa_data,
        compiled_extracted_data=compiled_data,
        result=audit_result,
        expiration_date=expiration_date,
        suggested_comment=suggested_comment,
        screenshot_url=screenshot_url or None,
        comparison_input_tokens=0,
        comparison_output_tokens=0,
        comparison_cost_usd=0.0,
        total_run_cost_usd=total_run_cost,
        comparison_table=comparison_table_dict
    )

    resolved_audit_id = await audit_data.log_audit_run(supplier_name, [], audit_log)
    if not resolved_audit_id:
        resolved_audit_id = audit_id

    return AuditResultResponse(
        audit_id=resolved_audit_id,
        supplier_id=0,
        supplier_name=supplier_name,
        workspace_title=workspace_title,
        cert_type=cert_type,
        filename=", ".join(doc.filename for doc in matching_docs),
        result=audit_result,
        expiration_date=expiration_date,
        suggested_comment=suggested_comment,
        screenshot_url=screenshot_url or None,
        comparison_input_tokens=0,
        comparison_output_tokens=0,
        comparison_cost_usd=0.0,
        comparison_cost_myr=0.0,
        total_run_cost_usd=total_run_cost,
        total_run_cost_myr=total_run_cost * 4.70,
        comparison_table=comparison_table_dict
    )


@app.post("/api/audit", response_model=AuditResultResponse)
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
        screenshot_filename = f"screenshot_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
        screenshot_bytes = screenshot.file.read()
        screenshot.file.seek(0)
        screenshot_url = storage.get_storage().upload(
            screenshot_bytes, safe_supplier_name, screenshot_filename, "image/png"
        )

    temp_audit_id = f"TEMP_{uuid.uuid4()}"
    timestamp = datetime.now().strftime("%d/%m/%Y, %H:%M:%S")

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

    expiration_date = "N/A"
    if extracted_docs:
        expiration_date = extracted_docs[0]["extracted_data"].get("expirationDate", "N/A")

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
        expiration_date=expiration_date,
        suggested_comment=suggested_comment,
        screenshot_url=screenshot_url,
        comparison_input_tokens=0,
        comparison_output_tokens=0,
        comparison_cost_usd=0.0,
        total_run_cost_usd=total_run_cost,
        comparison_table=comparison_table_dict,
    )

    resolved_audit_id = await audit_data.log_audit_run(supplier_name, doc_evidences, audit_log)
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
        expiration_date=expiration_date,
        suggested_comment=suggested_comment,
        screenshot_url=screenshot_url,
        comparison_input_tokens=comp_in_t,
        comparison_output_tokens=comp_out_t,
        comparison_cost_usd=comp_cost,
        total_run_cost_usd=total_run_cost,
        comparison_table=comparison_table_dict,
    )

@app.get("/api/costs")
async def get_cost_analytics():
    return await audit_data.get_cost_analytics()


@app.post("/api/certificates/verify", response_model=CertificateVerifyResult)
async def verify_certificate(
    file: UploadFile = File(...),
    supplier_name: str = Form(...),
    question_label: Optional[str] = Form(None),
    qa_answers: Optional[str] = Form("[]"),
    qa_data_title: Optional[str] = Form(""),
):
    """
    Phase 4 pipeline: upload a certificate PDF/image -> DeepSeek extraction ->
    Qwen judge -> save to certificate_verifications -> return verdict + reasoning.
    """
    from app.services import extractor, judge
    from app.db.session import get_session_factory
    from app.repositories.certificates import CertificateRepository

    file_bytes = await file.read()
    mime_type = file.content_type or "application/pdf"
    filename = file.filename or "certificate"

    file_url = storage.get_storage().upload(file_bytes, supplier_name, filename, mime_type)

    # 1. Extract
    extracted_data, in_t, out_t, cost = extractor.extract_certificate_data(
        file_bytes, mime_type, question_label,
    )
    if extracted_data.get("certificateOwnerName") == "Extraction Failed":
        raise HTTPException(status_code=502, detail="Certificate extraction failed.")

    # 2. Judge
    verdict = judge.judge_certificate(
        extracted_data,
        supplier_name,
        ariba_question_label=question_label,
        ariba_qa_answers=qa_answers,
        qa_data_title=qa_data_title,
    )

    # 3. Persist
    factory = get_session_factory()
    record_id = None
    async with factory() as session:
        repo = CertificateRepository(session)
        record = await repo.create(
            file_url=file_url or "",
            extracted_data={**extracted_data, "confidence": verdict["confidence"]},
            status=verdict["status"],
            judge_reasoning=verdict["reasoning_trace"],
        )
        record_id = str(record.id)

    return CertificateVerifyResult(
        status=verdict["status"],
        extracted_data=extracted_data,
        reasoning_trace=verdict["reasoning_trace"],
        confidence=verdict["confidence"],
        judge_source=verdict["judge_source"],
        rule_result=verdict["rule_result"],
        record_id=record_id,
    )


@app.get("/api/certificates", response_model=List[CertificateVerificationResponse])
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
            judge_reasoning=r.judge_reasoning,
            confidence=float(confidence) if confidence is not None else None,
            created_at=r.created_at.isoformat() if r.created_at else None,
        ))
    return results


@app.post("/api/documents/upload", response_model=DocumentIngestResult)
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


@app.get("/api/documents", response_model=List[DocumentSummary])
async def list_documents(limit: int = 50, offset: int = 0):
    """
    List ingested documents with parent/child chunk counts.
    """
    from app.db.session import get_session_factory
    from app.repositories.documents import DocumentRepository, ChunkRepository

    factory = get_session_factory()
    async with factory() as session:
        doc_repo = DocumentRepository(session)
        chunk_repo = ChunkRepository(session)
        docs = await doc_repo.list_all(limit=limit, offset=offset)

        summaries = []
        for doc in docs:
            counts = await chunk_repo.count_by_document(doc.id)
            summaries.append(DocumentSummary(
                id=str(doc.id),
                title=doc.title,
                file_url=doc.file_url,
                parent_count=counts["parent_chunks"],
                child_count=counts["child_chunks"],
                created_at=doc.created_at.isoformat() if doc.created_at else None,
            ))
    return summaries


@app.get("/api/logs/{supplier_id}/assets")
async def get_supplier_assets(supplier_id: int):
    """
    Returns documents and screenshots for a supplier via file_urls in the DB.
    """
    screenshots = await audit_data.get_screenshot_urls_by_supplier_id(supplier_id)
    documents = await audit_data.get_evidence_urls_by_supplier_id(supplier_id)
    return {"screenshots": screenshots, "documents": documents}


MAX_PROXY_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


def _build_proxy_url(raw_url: str) -> str:
    import base64
    padded = raw_url + "=" * ((4 - len(raw_url) % 4) % 4)
    return base64.urlsafe_b64decode(padded).decode("utf-8")


@app.get("/api/files/{encoded_url:path}")
def proxy_supabase_file(encoded_url: str):
    """
    Legacy: proxies a file from Supabase Storage through the backend for
    historical records. New uploads use /api/files/local/* instead.
    Only allows URLs matching the configured SUPABASE_URL storage prefix.
    """
    try:
        url = _build_proxy_url(encoded_url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid URL encoding: {e}")

    allowed_prefix = settings.supabase_url.rstrip("/") + "/storage/v1/object/public/certificates/"
    if not url.startswith(allowed_prefix):
        raise HTTPException(status_code=404, detail="Not found.")

    try:
        resp = requests.get(url, stream=True, timeout=30, headers={"User-Agent": "GPO-Auditor/1.0"})
        resp.raise_for_status()

        content_length = resp.headers.get("content-length")
        if content_length and int(content_length) > MAX_PROXY_FILE_SIZE:
            resp.close()
            raise HTTPException(status_code=413, detail="File too large.")

        chunks = []
        total = 0
        for chunk in resp.iter_content(65536):
            total += len(chunk)
            if total > MAX_PROXY_FILE_SIZE:
                resp.close()
                raise HTTPException(status_code=413, detail="File too large.")
            chunks.append(chunk)
        body = b"".join(chunks)

        filename = url.split("/")[-1].split("?")[0]
        from urllib.parse import unquote
        filename = unquote(filename)
        content_type = resp.headers.get("content-type", "application/octet-stream")
        return Response(content=body, media_type=content_type,
                        headers={
                            "Content-Disposition": f'inline; filename="{filename}"',
                            "Access-Control-Allow-Origin": "*",
                        })
    except requests.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Storage fetch failed: {e}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch file: {e}")


@app.get("/api/files/local/{folder}/{filename}")
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


