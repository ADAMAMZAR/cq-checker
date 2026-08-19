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
import re
import requests
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from app.models.tables import uuid7
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, Query, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse

from app.config import settings
from app.schemas import (
    SupplierEntry, AuditLogEntry, AuditResultResponse, DocumentEvidence, DocumentEvidenceSummary, UpdateEvidenceRequest,
    AuditRegistryEntry, AuditRegistryDetail, CertificateVerificationResponse, CertificateVerifyResult,
    DocumentIngestResult, DocumentSummary, DocumentFolderSummary, CreateFolderRequest, UpdateFolderRequest, MoveDocumentRequest, UpdateDocumentRegionRequest,
    ChatRequest, ChatResponse, ChatSource, RetrievalTestRequest,
    ChatHistoryResponse, FeedbackRequest, FeedbackResponse,
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

async def init_db_tables():
    """Ensure document_folders table and documents.folder_id column exist on startup."""
    from sqlalchemy import text
    from app.db.session import get_session_factory

    factory = get_session_factory()
    async with factory() as session:
        await session.execute(text("""
            CREATE TABLE IF NOT EXISTS document_folders (
                id UUID PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        """))
        await session.execute(text("""
            ALTER TABLE documents 
            ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES document_folders(id) ON DELETE SET NULL;
        """))
        await session.execute(text("""
            ALTER TABLE documents 
            ADD COLUMN IF NOT EXISTS region VARCHAR(20) NOT NULL DEFAULT 'GENERAL';
        """))

        # Auto-classify existing document regions by title
        await session.execute(text("UPDATE documents SET region = 'VN' WHERE (title ILIKE '%vietnam%' OR title ILIKE '%vn%') AND region = 'GENERAL';"))
        await session.execute(text("UPDATE documents SET region = 'TW' WHERE (title ILIKE '%taiwan%' OR title ILIKE '%tw%' OR title LIKE '%台灣%' OR title LIKE '%臺灣%') AND region = 'GENERAL';"))
        await session.execute(text("UPDATE documents SET region = 'MY' WHERE (title ILIKE '%malaysia%' OR title ILIKE '%my%') AND region = 'GENERAL';"))
        await session.execute(text("UPDATE documents SET region = 'AU' WHERE (title ILIKE '%australia%' OR title ILIKE '%au%') AND region = 'GENERAL';"))

        res = await session.execute(text("SELECT COUNT(*) FROM document_folders;"))
        cnt = res.scalar() or 0
        if cnt == 0:
            import uuid
            default_id = str(uuid.uuid4())
            await session.execute(text(
                "INSERT INTO document_folders (id, name) VALUES (:id, 'General') ON CONFLICT DO NOTHING;"
            ), {"id": default_id})
        
        # Ensure RBAC tables exist for roles & features
        await session.execute(text("""
            CREATE TABLE IF NOT EXISTS roles (
                id UUID PRIMARY KEY,
                name VARCHAR(50) NOT NULL UNIQUE,
                display_name VARCHAR(100) NOT NULL,
                description TEXT
            );
        """))
        await session.execute(text("""
            CREATE TABLE IF NOT EXISTS features (
                id VARCHAR(50) PRIMARY KEY,
                display_name VARCHAR(100) NOT NULL,
                description TEXT,
                route_path VARCHAR(200),
                is_external VARCHAR(1) NOT NULL DEFAULT '0',
                sort_order INTEGER NOT NULL DEFAULT 0
            );
        """))
        await session.execute(text("""
            CREATE TABLE IF NOT EXISTS user_roles (
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
                granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                PRIMARY KEY (user_id, role_id)
            );
        """))
        await session.execute(text("""
            CREATE TABLE IF NOT EXISTS role_features (
                role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
                feature_id VARCHAR(50) REFERENCES features(id) ON DELETE CASCADE,
                PRIMARY KEY (role_id, feature_id)
            );
        """))
        await session.commit()

        try:
            from app.auth.seed import seed
            await seed()
        except Exception as seed_err:
            logger.warning(f"Auto-seed warning: {seed_err}")


@asynccontextmanager
async def lifespan(app_instance: FastAPI):
    try:
        await init_db_tables()
    except Exception as e:
        logger.error(f"Failed to initialize database tables: {e}")
    yield


app = FastAPI(
    title="GPO Automatic Certificate Auditor API",
    description="Backend API for auditing certificates and logging results to Neon PostgreSQL",
    version="1.0.0",
    openapi_tags=API_TAGS,
    lifespan=lifespan,
)

# Configure CORS so the Chrome Extension and Next.js can connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

        # One evidence record per (file, question) so a merged file attached to
        # several questions is fully represented in the database.
        for q_label, q_answers in entry["q_pairs"]:
            matched_cert = _cert_for_question(extracted_data, q_label)
            gemini_supp_name = matched_cert.get("certificateOwnerName", supplier_name)
            p_start = matched_cert.get("pageStart", 1)
            p_end = matched_cert.get("pageEnd", 1)

            # Create focused cert payload for this specific question
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
@app.post("/api/ariba/suppliers", response_model=List[SupplierEntry], tags=["Supplier Audit — Single Phase Waterfall"])
async def get_ariba_suppliers_endpoint(
    q: Optional[str] = Query(None, description="Optional search query to filter suppliers"),
    payload: Optional[Dict[str, Any]] = None,
):
    """
    Fetches live Ariba Step 1 suppliers ('InQualification' status) via app.services.supplier_search.
    Supports POST/GET request. Sends POST request to SAP Ariba OpenAPI with Bearer token & apiKey.
    Optionally filters by search query 'q' or 'payload.query'.
    """
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


@app.get("/api/ariba/suppliers/{sm_vendor_id}/questionnaires", tags=["Supplier Audit — Single Phase Waterfall"])
async def get_ariba_questionnaires_endpoint(sm_vendor_id: str):
    """
    Step 2: Fetches all questionnaires for a given SM Vendor ID from Ariba.
    """
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


@app.get("/api/ariba/suppliers/{sm_vendor_id}/questionnaires/{doc_id}/answers", tags=["Supplier Audit — Single Phase Waterfall"])
async def get_ariba_questionnaire_answers_endpoint(sm_vendor_id: str, doc_id: str):
    """
    Step 3: Fetches Q&A answers and certificate inputs for a specific questionnaire doc_id.
    """
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


@app.post("/api/ariba/suppliers/{sm_vendor_id}/questionnaires/{doc_id}/download-attachments", tags=["Supplier Audit — Single Phase Waterfall"])
async def download_ariba_attachments_endpoint(sm_vendor_id: str, doc_id: str):
    """
    Downloads all certificate attachment files for a questionnaire from SAP Ariba
    and saves them temporarily to local disk storage.
    """
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


@app.post("/api/audit/ariba-supplier", tags=["Supplier Audit — Single Phase Waterfall"])
async def audit_ariba_supplier_endpoint(sm_vendor_id: str, doc_id: Optional[str] = None):
    """
    Executes the complete 2-stage multi-certificate audit pipeline for an Ariba supplier:
    Downloads attachments ➔ Runs Gemini 3.5 Flash Vision OCR ➔ Executes Python auditor rules ➔ Persists to Neon DB.
    """
    try:
        res = await supplier_search.run_ariba_2stage_audit_pipeline(sm_vendor_id, doc_id)
        return res
    except Exception as e:
        logger.error(f"Error auditing Ariba supplier {sm_vendor_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/audit-registry", response_model=List[AuditRegistryEntry], tags=["Supplier Audit — Read / Update"])
async def get_audit_registry(limit: int = 1000, offset: int = 0):
    """
    Consolidated audit registry summary list with supplier info, result, and document counts.
    """
    return await audit_data_access.get_audit_registry(limit=limit, offset=offset)

@app.get("/api/audit-registry/{audit_id}", response_model=AuditRegistryDetail, tags=["Supplier Audit — Read / Update"])
async def get_audit_registry_detail(audit_id: str):
    """
    Fetches full audit registry details (comparison table, suggested comments, screenshot URL) for a specific audit run.
    """
    detail = await audit_data_access.get_audit_registry_detail(audit_id)
    if not detail:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit record not found.")
    return detail

@app.get("/api/evidence/summary", response_model=List[DocumentEvidenceSummary], tags=["Supplier Audit — Read / Update"])
async def get_evidence_summary(
    supplier_name: Optional[str] = None,
    supplier_id: Optional[int] = None,
    audit_id: Optional[str] = None,
):
    """
    Fetches lightweight evidence summary list (document id, filename, question label, supplier info, created date)
    for listing supplier certificates without loading heavy metadata payloads.
    """
    return await audit_data_access.get_document_evidence_summary(
        supplier_name=supplier_name,
        supplier_id=supplier_id,
        audit_id=audit_id,
    )

@app.get("/api/evidence/{document_id}", response_model=DocumentEvidence, tags=["Supplier Audit — Read / Update"])
async def get_evidence_document(document_id: str):
    """
    Fetches entire document evidence data (full extracted metadata, raw OCR, tokens, etc.) for a single document ID.
    """
    evidence = await audit_data_access.get_document_evidence_by_id(document_id)
    if not evidence:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document evidence record not found.")
    return evidence

@app.get("/api/evidence", response_model=List[DocumentEvidence], tags=["Supplier Audit — Read / Update"])
async def get_evidence(audit_id: Optional[str] = None):
    """
    Fetches historical document evidence logs (extracted file details) from Neon.
    Optionally filter by audit_id.
    """
    evidence = await audit_data_access.get_document_evidence_logs(audit_id=audit_id)
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
    cert_type: Optional[str] = Form(None),
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
@app.post("/api/documents/upload/", response_model=DocumentIngestResult, tags=["Document Ingestion / RAG"])
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    overwrite: bool = Form(True),
):
    """
    Upload a manual PDF -> parse (Vision OCR) -> embed (gemini-embedding-2) -> store/overwrite in Postgres.
    """
    from app.services.ingest import ingest_document

    file_bytes = await file.read()
    filename = file.filename or "manual.pdf"
    content_type = file.content_type or ("text/markdown" if filename.lower().endswith((".md", ".markdown", ".txt")) else "application/pdf")
    raw_title = title or filename
    doc_title = re.sub(r'\.(pdf|pptx|docx|doc|ppt|xlsx|xls|png|jpg|jpeg|txt|md)$', '', raw_title, flags=re.IGNORECASE).strip() or raw_title

    result = await ingest_document(file_bytes, doc_title, filename, content_type, overwrite=overwrite)
    if result.status == "failed":
        raise HTTPException(status_code=502, detail=result.message)
    return DocumentIngestResult(**result.to_dict())


@app.post("/api/documents/bulk-upload", tags=["Document Ingestion / RAG"])
@app.post("/api/documents/bulk-upload/", tags=["Document Ingestion / RAG"])
async def bulk_upload_documents(
    files: List[UploadFile] = File(...),
    overwrite: bool = Form(True),
):
    """
    Bulk Upload multiple PDF or Markdown manuals -> parse -> embed -> store/overwrite in Postgres.
    """
    from app.services.ingest import bulk_ingest_documents

    if not files:
        raise HTTPException(status_code=400, detail="No files provided for bulk upload.")

    items = []
    for f in files:
        f_bytes = await f.read()
        fname = f.filename or "document.pdf"
        ctype = f.content_type or ("text/markdown" if fname.lower().endswith((".md", ".markdown", ".txt")) else "application/pdf")
        items.append({
            "file_bytes": f_bytes,
            "filename": fname,
            "title": fname,
            "content_type": ctype,
        })

    results = await bulk_ingest_documents(items, overwrite=overwrite)
    return [r.to_dict() for r in results]


@app.post("/api/documents/test-ingest", tags=["Document Ingestion / RAG"])
@app.post("/api/documents/test-ingest/", tags=["Document Ingestion / RAG"])
async def test_upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    mode: str = Form("single"),
    page_number: int = Form(1),
):
    """
    Test Document Ingestion (Vision OCR Sandbox).
    Runs OCR on a whole PDF or specific page WITHOUT saving to database.
    """
    from app.services.ingest import test_ingest_document

    file_bytes = await file.read()
    filename = file.filename or "manual.pdf"
    doc_title = title or filename

    try:
        res = await test_ingest_document(
            file_bytes=file_bytes,
            filename=filename,
            title=doc_title,
            mode=mode,
            page_number=page_number,
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/documents/commit-pages", tags=["Document Ingestion / RAG"])
@app.post("/api/documents/commit-pages/", tags=["Document Ingestion / RAG"])
async def commit_document_pages(payload: dict):
    """
    Commit/Overwrite tested page OCR results into PostgreSQL document_pages table.
    """
    from app.services.ingest import commit_ingest_pages

    filename = payload.get("filename", "manual.pdf")
    title = payload.get("title", filename)
    pages = payload.get("pages", [])
    if not pages:
        raise HTTPException(status_code=400, detail="No pages provided for commit.")

    try:
        res = await commit_ingest_pages(filename=filename, title=title, pages=pages)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
                region=doc.region or "GENERAL",
                page_count=p_cnt,
                parent_count=p_cnt,
                child_count=p_cnt,
                folder_id=str(doc.folder_id) if doc.folder_id else None,
                folder_name=doc.folder_name,
                created_at=to_malaysia(doc.created_at).strftime("%d/%m/%Y, %H:%M:%S") if doc.created_at else None,
            ))
    return summaries


@app.get("/api/documents/{document_id}/content", tags=["Document Ingestion / RAG"])
async def get_document_content(document_id: str):
    """Retrieve full structured page contents and metadata for a document."""
    from uuid import UUID
    from app.db.session import get_session_factory
    from app.repositories.documents import DocumentRepository, PageRepository

    try:
        d_uuid = UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document_id UUID.")

    factory = get_session_factory()
    async with factory() as session:
        doc_repo = DocumentRepository(session)
        page_repo = PageRepository(session)
        doc = await doc_repo.get_by_id(d_uuid)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found.")

        pages = await page_repo.list_pages(d_uuid)
        content_type = ""
        if doc.object_storage:
            content_type = doc.object_storage.content_type or ""

        page_list = []
        for p in pages:
            page_list.append({
                "page_number": p.page_number,
                "content": p.content or "",
            })

        return {
            "id": str(doc.id),
            "title": doc.title,
            "file_url": doc.file_url,
            "region": doc.region,
            "content_type": content_type,
            "page_count": len(page_list),
            "pages": page_list,
        }


# ── Document Folders API Endpoints ──────────────────────────────────────────

@app.get("/api/folders", response_model=List[DocumentFolderSummary], tags=["Document Ingestion / RAG"])
async def list_folders():
    """List all document folders with document counts."""
    from app.db.session import get_session_factory
    from app.repositories.documents import FolderRepository

    factory = get_session_factory()
    async with factory() as session:
        repo = FolderRepository(session)
        folders = await repo.list_all()
        return [DocumentFolderSummary(**f) for f in folders]


@app.post("/api/folders", response_model=DocumentFolderSummary, tags=["Document Ingestion / RAG"])
async def create_folder(payload: CreateFolderRequest):
    """Create a new document folder."""
    from app.db.session import get_session_factory
    from app.repositories.documents import FolderRepository

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name cannot be empty.")

    factory = get_session_factory()
    async with factory() as session:
        repo = FolderRepository(session)
        existing = await repo.get_by_name(name)
        if existing:
            raise HTTPException(status_code=400, detail=f"Folder '{name}' already exists.")
        folder = await repo.create(name)
        return DocumentFolderSummary(
            id=str(folder.id),
            name=folder.name,
            document_count=0,
            created_at=to_malaysia(folder.created_at).strftime("%d/%m/%Y, %H:%M:%S") if folder.created_at else None,
        )


@app.put("/api/folders/{folder_id}", response_model=DocumentFolderSummary, tags=["Document Ingestion / RAG"])
async def update_folder(folder_id: str, payload: UpdateFolderRequest):
    """Rename a document folder."""
    from uuid import UUID
    from app.db.session import get_session_factory
    from app.repositories.documents import FolderRepository

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name cannot be empty.")

    try:
        f_uuid = UUID(folder_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid folder_id UUID.")

    factory = get_session_factory()
    async with factory() as session:
        repo = FolderRepository(session)
        updated = await repo.update(f_uuid, name)
        if not updated:
            raise HTTPException(status_code=404, detail="Folder not found.")
        all_folders = await repo.list_all()
        found = next((f for f in all_folders if f["id"] == str(f_uuid)), None)
        cnt = found["document_count"] if found else 0
        return DocumentFolderSummary(
            id=str(updated.id),
            name=updated.name,
            document_count=cnt,
            created_at=to_malaysia(updated.created_at).strftime("%d/%m/%Y, %H:%M:%S") if updated.created_at else None,
        )


@app.delete("/api/folders/{folder_id}", tags=["Document Ingestion / RAG"])
async def delete_folder(folder_id: str):
    """Delete a document folder."""
    from uuid import UUID
    from app.db.session import get_session_factory
    from app.repositories.documents import FolderRepository

    try:
        f_uuid = UUID(folder_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid folder_id UUID.")

    factory = get_session_factory()
    async with factory() as session:
        repo = FolderRepository(session)
        success = await repo.delete(f_uuid)
        if not success:
            raise HTTPException(status_code=404, detail="Folder not found.")
        return {"status": "success", "message": "Folder deleted."}


@app.patch("/api/documents/{document_id}/folder", tags=["Document Ingestion / RAG"])
async def move_document_folder(document_id: str, payload: MoveDocumentRequest):
    """Move a document to a folder or uncategorize it (folder_id=None)."""
    from uuid import UUID
    from app.db.session import get_session_factory
    from app.repositories.documents import DocumentRepository, FolderRepository

    try:
        d_uuid = UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document_id UUID.")

    f_uuid = None
    if payload.folder_id:
        try:
            f_uuid = UUID(payload.folder_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid folder_id UUID.")

    factory = get_session_factory()
    async with factory() as session:
        doc_repo = DocumentRepository(session)
        if f_uuid:
            folder_repo = FolderRepository(session)
            folder = await folder_repo.get_by_id(f_uuid)
            if not folder:
                raise HTTPException(status_code=404, detail="Target folder not found.")

        doc = await doc_repo.move_to_folder(d_uuid, f_uuid)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found.")
        return {
            "status": "success",
            "document_id": str(doc.id),
            "folder_id": str(doc.folder_id) if doc.folder_id else None,
            "folder_name": doc.folder_name,
        }


@app.patch("/api/documents/{document_id}/region", tags=["Document Ingestion / RAG"])
async def update_document_region(document_id: str, payload: UpdateDocumentRegionRequest):
    """Update a document's region classification (VN, TW, MY, AU, GENERAL)."""
    from uuid import UUID
    from app.db.session import get_session_factory
    from app.repositories.documents import DocumentRepository

    try:
        d_uuid = UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document_id UUID.")

    new_region = payload.region.upper().strip()
    if new_region not in ("VN", "TW", "MY", "AU", "GENERAL"):
        raise HTTPException(status_code=400, detail="Invalid region. Must be one of: VN, TW, MY, AU, GENERAL.")

    factory = get_session_factory()
    async with factory() as session:
        doc_repo = DocumentRepository(session)
        doc = await doc_repo.update_region(d_uuid, new_region)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found.")
        return {
            "status": "success",
            "document_id": str(doc.id),
            "region": doc.region,
        }


@app.post("/api/retrieval/test", tags=["Document Ingestion / RAG"])
async def test_retrieval(payload: RetrievalTestRequest):
    """
    Test PostgreSQL Hybrid Retrieval Playground.
    Allows testing vector vs keyword weights, Top-K seed hits, and window sizes.
    """
    import time
    from sqlalchemy import text
    from app.services import embeddings
    from app.db.session import get_session_factory

    query_text = payload.query.strip()
    if not query_text:
        raise HTTPException(status_code=400, detail="Query text cannot be empty.")

    start_time = time.monotonic()
    query_embedding = embeddings.embed_text(query_text)
    embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"

    factory = get_session_factory()
    async with factory() as session:
        vw = float(payload.vector_weight)
        bw = float(payload.bm25_weight)
        k = max(1, min(50, payload.k))
        w_size = max(0, min(10, payload.window_size))

        from app.services.region_router import classify_query_intent
        intent = classify_query_intent(query_text)

        # Determine region filter SQL clause
        target_regions = intent["target_regions"]
        if payload.region_filter and payload.region_filter.upper() != "AUTO":
            if payload.region_filter.upper() == "ALL":
                target_regions = None
            else:
                target_regions = [payload.region_filter.upper(), "GENERAL"]

        region_clause = ""
        params = {"q": query_text, "vw": vw, "bw": bw, "k": k}
        if target_regions:
            region_clause = "AND (d.region = ANY(:target_regions) OR d.region = 'GENERAL')"
            params["target_regions"] = list(target_regions)

        sql_seed = text(f"""
            SELECT
                dp.id AS page_id,
                dp.content AS page_content,
                dp.page_number AS page_number,
                d.id AS document_id,
                d.title AS title,
                d.region AS region,
                COALESCE(os.file_url, '') AS file_url,
                (1 - (dp.embedding <=> '{embedding_str}'::vector(1536))) AS vector_similarity,
                COALESCE(ts_rank_cd(dp.tsv_content, websearch_to_tsquery('english', :q)), 0) AS bm25_rank,
                (:vw * (1 - (dp.embedding <=> '{embedding_str}'::vector(1536)))
                 + :bw * COALESCE(ts_rank_cd(dp.tsv_content, websearch_to_tsquery('english', :q)), 0)) AS combined_score
            FROM document_pages dp
            JOIN documents d ON d.id = dp.document_id
            LEFT JOIN object_storage os ON os.id = d.object_id
            WHERE dp.embedding IS NOT NULL
            {region_clause}
            ORDER BY combined_score DESC
            LIMIT :k
        """)

        res_seed = await session.execute(sql_seed, params)
        seed_hits = []
        for r in res_seed:
            seed_hits.append({
                "page_id": str(r.page_id),
                "page_content": r.page_content or "",
                "page_number": r.page_number,
                "document_id": str(r.document_id),
                "title": r.title,
                "region": getattr(r, "region", "GENERAL") or "GENERAL",
                "file_url": r.file_url,
                "vector_similarity": round(float(r.vector_similarity or 0.0), 4),
                "bm25_rank": round(float(r.bm25_rank or 0.0), 4),
                "combined_score": round(float(r.combined_score or 0.0), 4),
            })

        final_results = []
        if seed_hits:
            conditions = []
            for s in seed_hits:
                p_start = max(1, s["page_number"] - 1)
                p_end = s["page_number"] + w_size
                conditions.append(f"(dp.document_id = '{s['document_id']}' AND dp.page_number BETWEEN {p_start} AND {p_end})")

            where_clause = " OR ".join(conditions)
            sql_window = text(f"""
                SELECT
                    dp.document_id,
                    d.title,
                    COALESCE(os.file_url, '') AS file_url,
                    MIN(dp.page_number) AS page_start,
                    MAX(dp.page_number) AS page_end,
                    string_agg(dp.content, E'\n\n--- Page Break ---\n\n' ORDER BY dp.page_number) AS window_content
                FROM document_pages dp
                JOIN documents d ON d.id = dp.document_id
                LEFT JOIN object_storage os ON os.id = d.object_id
                WHERE {where_clause}
                GROUP BY dp.document_id, d.title, os.file_url
            """)
            res_win = await session.execute(sql_window)
            win_map = {str(r.document_id): (r.page_start, r.page_end, r.window_content) for r in res_win}

            # Group seed hits by document_id to merge overlapping page ranges
            doc_seeds_map = {}
            for s in seed_hits:
                d_id = s["document_id"]
                if d_id not in doc_seeds_map:
                    doc_seeds_map[d_id] = {
                        "top_seed_hit": s,
                        "seed_pages": [s["page_number"]],
                    }
                else:
                    doc_seeds_map[d_id]["seed_pages"].append(s["page_number"])

            for d_id, info in doc_seeds_map.items():
                s = info["top_seed_hit"]
                seed_pages = info["seed_pages"]
                w_info = win_map.get(d_id)
                p_start, p_end, w_content = w_info if w_info else (s["page_number"], s["page_number"], s["page_content"])
                final_results.append({
                    **s,
                    "seed_pages": seed_pages,
                    "page_number_start": p_start,
                    "page_number_end": p_end,
                    "window_content": w_content,
                })

    latency_ms = round((time.monotonic() - start_time) * 1000, 2)
    return {
        "query": query_text,
        "latency_ms": latency_ms,
        "k": k,
        "window_size": w_size,
        "vector_weight": vw,
        "bm25_weight": bw,
        "detected_region": intent["detected_region"],
        "output_lang_name": intent["output_lang_name"],
        "seed_hits_count": len(seed_hits),
        "results": final_results,
    }


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
        message_id=result.get("message_id"),
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


@app.post("/api/chat/feedback", response_model=FeedbackResponse, tags=["RAG Chatbot"])
async def chat_feedback(payload: FeedbackRequest):
    """
    Submit user feedback (satisfied / not_satisfied) for a chatbot response.
    """
    from app.db.session import get_session_factory
    from app.repositories.chat import ChatFeedbackRepository, ChatMessageRepository

    if payload.rating not in ("satisfied", "not_satisfied"):
        raise HTTPException(status_code=400, detail="rating must be 'satisfied' or 'not_satisfied'")

    factory = get_session_factory()
    async with factory() as session:
        msg_repo = ChatMessageRepository(session)
        try:
            msg_uuid = uuid.UUID(payload.message_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid message_id format")

        from sqlalchemy import select
        from app.models.tables import ChatMessage
        result = await session.execute(select(ChatMessage).where(ChatMessage.id == msg_uuid))
        msg = result.scalar_one_or_none()
        if not msg:
            raise HTTPException(status_code=404, detail="Message not found")

        fb_repo = ChatFeedbackRepository(session)
        existing = await fb_repo.get_by_message_id(msg_uuid)
        if existing:
            raise HTTPException(status_code=409, detail="Feedback already submitted for this message")

        record = await fb_repo.add(
            message_id=msg_uuid,
            session_id=payload.session_id,
            rating=payload.rating,
            reason=payload.reason,
        )
        return FeedbackResponse(
            id=str(record.id),
            message_id=str(record.message_id),
            rating=record.rating,
            reason=record.reason,
            created_at=record.created_at.isoformat() if record.created_at else None,
        )


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
async def db_get_table(table_name: str, limit: int = 100, offset: int = 0, q: Optional[str] = Query(None)):
    """
    Read-only: return a page of rows for a table (validated against the
    whitelist from information_schema). `limit` is clamped to 500.
    """
    from app.services import database_inspector

    valid = await database_inspector.list_tables()
    names = {t["name"] for t in valid}
    if table_name not in names:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found.")
    return await database_inspector.get_table_data(table_name, limit=limit, offset=offset, search=q)


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


@app.put("/api/db/tables/{table_name}", tags=["Database Browser"])
async def db_update_row(table_name: str, payload: dict):
    """
    Update a single cell in a row identified by its primary key.

    Body: ``{"pk": {"<primary_key_column>": "<value>", ...}, "column": "<column_name>", "value": "<new_value>"}``.
    """
    from app.services import database_inspector

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


# ── Auth & RBAC Endpoints ───────────────────────────────────────────────────

@app.get("/api/v1/auth/roles", tags=["Auth & RBAC"])
@app.get("/api/auth/roles", tags=["Auth & RBAC"])
async def get_roles_and_features():
    """Return all system roles, registered features, and role-feature permissions."""
    from sqlalchemy import select
    from app.db.session import get_session_factory
    from app.models.tables import Role, Feature, RoleFeature
    from app.auth.seed import ROLES, FEATURES, ROLE_FEATURES, TEST_USERS

    try:
        factory = get_session_factory()
        async with factory() as session:
            roles_db = (await session.execute(select(Role))).scalars().all()
            features_db = (await session.execute(select(Feature))).scalars().all()
            rf_rows = (await session.execute(select(RoleFeature))).scalars().all()

            if roles_db:
                role_features_map = {}
                for rf in rf_rows:
                    role_features_map.setdefault(str(rf.role_id), []).append(rf.feature_id)

                roles_list = []
                for r in roles_db:
                    f_ids = role_features_map.get(str(r.id), ROLE_FEATURES.get(r.name, []))
                    test_u = next((u["email"] for u in TEST_USERS if r.name in u["roles"]), None)
                    roles_list.append({
                        "id": str(r.id),
                        "name": r.name,
                        "display_name": r.display_name,
                        "description": r.description,
                        "feature_ids": f_ids,
                        "test_user": test_u,
                    })

                features_list = [
                    {
                        "id": f.id,
                        "display_name": f.display_name,
                        "description": f.description,
                        "route_path": f.route_path,
                        "is_external": f.is_external == "1",
                        "sort_order": f.sort_order,
                    }
                    for f in features_db
                ]
                return {"roles": roles_list, "features": features_list}
    except Exception as e:
        logger.warning(f"Error fetching roles from DB: {e}")

    roles_list = []
    for r in ROLES:
        roles_list.append({
            "name": r["name"],
            "display_name": r["display_name"],
            "description": r["description"],
            "feature_ids": ROLE_FEATURES.get(r["name"], []),
            "test_user": next((u["email"] for u in TEST_USERS if r["name"] in u["roles"]), None),
        })
    return {"roles": roles_list, "features": FEATURES}


@app.post("/api/v1/auth/seed", tags=["Auth & RBAC"])
@app.post("/api/auth/seed", tags=["Auth & RBAC"])
async def trigger_seed():
    """Trigger database seed for roles, features, and test users."""
    from app.auth.seed import seed
    await seed()
    return {"status": "success", "message": "Roles, features, and test users seeded successfully"}






