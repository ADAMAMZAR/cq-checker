import sys
# Force python to raise ImportError when attempting to load the incompatible C-extension
sys.modules['google._upb._message'] = None

import os
# Force pure Python implementation of Protobuf to bypass Python 3.14 C-extension incompatibilities
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

import hashlib
import json
import asyncio
import shutil
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.schemas import AuditLogEntry, AuditResultResponse, DocumentEvidence, UpdateEvidenceRequest
import uuid
from app.services import sheets, gemini

app = FastAPI(
    title="GPO Automatic Certificate Auditor API",
    description="Backend API for auditing certificates and logging results to Google Sheets",
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

# Serve uploaded screenshots and documents as static files for dashboard preview
app.mount("/static", StaticFiles(directory=settings.upload_dir), name="static")

@app.get("/")
def read_root():
    return {"status": "healthy", "service": "GPO Automatic Certificate Auditor API"}

@app.get("/api/logs", response_model=List[AuditLogEntry])
def get_logs():
    """
    Fetches all historical audit logs from Google Sheets.
    """
    logs = sheets.get_audit_logs()
    return logs

@app.get("/api/evidence", response_model=List[DocumentEvidence])
def get_evidence():
    """
    Fetches all historical document evidence logs (extracted file details) from Google Sheets.
    Useful for populating supplier selection dropdowns and performing cost calculations.
    """
    evidence = sheets.get_document_evidence_logs()
    return evidence

@app.put("/api/evidence")
def update_evidence(payload: UpdateEvidenceRequest):
    """
    Updates the extracted certificate details (JSON metadata) for a specific document evidence
    record identified by its Audit ID and Filename.
    """
    success = sheets.update_document_evidence(
        audit_id=payload.audit_id,
        filename=payload.filename,
        updated_metadata=payload.updated_metadata
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Matching document evidence record not found or update failed."
        )
    return {"status": "success", "message": "Document evidence updated successfully in Google Sheets."}

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

@app.post("/api/audit", response_model=AuditResultResponse)
async def run_audit(
    supplier_name: str = Form(...),
    workspace_title: str = Form(...),
    cert_type: str = Form(...),
    qa_data: str = Form(...),  # Scraped QA questions & answers
    files: List[UploadFile] = File(...),
    screenshot: Optional[UploadFile] = File(None)
):
    """
    Main endpoint called by the Chrome Extension.
    Saves attachments locally, triggers the audit,
    and records results in Google Sheets.
    """
    # Create supplier-specific subdirectories for evidence
    safe_supplier_name = "".join(c for c in supplier_name if c.isalnum() or c in (" ", "_", "-")).strip()
    supplier_dir = os.path.join(settings.upload_dir, safe_supplier_name)
    os.makedirs(supplier_dir, exist_ok=True)
    
    # Save the files
    saved_filenames = []
    for file in files:
        file_path = os.path.join(supplier_dir, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        saved_filenames.append(file.filename)
        
    # Save screenshot if provided
    screenshot_url = None
    if screenshot:
        screenshot_filename = f"screenshot_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
        screenshot_path = os.path.join(supplier_dir, screenshot_filename)
        screenshot_bytes = screenshot.file.read()
        screenshot.file.seek(0)
        
        with open(screenshot_path, "wb") as buffer:
            buffer.write(screenshot_bytes)
            
        if settings.supabase_url and settings.supabase_key:
            screenshot_url = sheets.upload_file_to_supabase_storage(
                screenshot_bytes, safe_supplier_name, screenshot_filename, "image/png"
            )
        else:
            screenshot_url = f"/static/{safe_supplier_name}/{screenshot_filename}"

    # Save QA data as a JSON file locally in the supplier folder
    qa_data_path = os.path.join(supplier_dir, "qa_data.json")
    with open(qa_data_path, "w", encoding="utf-8") as f:
        f.write(qa_data)

    # Relational Database Auditing Setup (Initial temp ID)
    temp_audit_id = f"TEMP_{uuid.uuid4()}"
    timestamp = datetime.now().strftime("%d/%m/%Y, %H:%M:%S")

    # Parse QA list to link questions/responses to specific files
    try:
        qa_list = json.loads(qa_data)
        if isinstance(qa_list, dict):
            qa_list = [qa_list]
        elif not isinstance(qa_list, list):
            qa_list = []
    except Exception:
        qa_list = []

    file_contexts = []
    file_tasks = []

    for file in files:
        # Look up matching QA block by filename matching
        matching_block = None
        for block in qa_list:
            attached = block.get("attachedFile", "")
            if attached and (attached.lower() in file.filename.lower() or file.filename.lower() in attached.lower()):
                matching_block = block
                break
        
        if matching_block:
            ariba_question_label = matching_block.get("questionLabel", "")
            ariba_qa_answers = json.dumps(matching_block.get("answers", []))
        else:
            ariba_question_label = "General Attachment"
            ariba_qa_answers = "[]"

        # Read saved file bytes from local uploads folder to avoid empty stream pointers
        file_path = os.path.join(supplier_dir, file.filename)
        with open(file_path, "rb") as f:
            file_bytes = f.read()

        file_hash = hashlib.sha256(file_bytes).hexdigest()

        # Check if already processed (cache hit)
        cached_record = sheets.find_metadata_by_hash(file_hash)
        if cached_record:
            # Reconstruct dummy/empty task for gather since we have a hit
            try:
                metadata_dict = json.loads(cached_record["gemini_extracted_metadata"])
            except Exception:
                metadata_dict = {}
            task = asyncio.to_thread(lambda: (
                metadata_dict,
                0, # input tokens
                0, # output tokens
                0.0 # cost
            ))
        else:
            # Schedule Gemini OCR extraction concurrently in thread
            task = asyncio.to_thread(
                gemini.extract_certificate_data,
                file_bytes,
                file.content_type or "application/pdf"
            )

        # Upload file to Supabase Storage if enabled
        file_url = None
        if settings.supabase_url and settings.supabase_key:
            file_url = sheets.upload_file_to_supabase_storage(
                file_bytes, safe_supplier_name, file.filename, file.content_type or "application/pdf"
            )

        file_contexts.append({
            "filename": file.filename,
            "content_type": file.content_type or "application/octet-stream",
            "ariba_question_label": ariba_question_label,
            "ariba_qa_answers": ariba_qa_answers,
            "file_hash": file_hash,
            "file_url": file_url
        })
        
        file_tasks.append(task)

    # Await parallel execution of all file extractions
    extraction_results = await asyncio.gather(*file_tasks)

    doc_evidences = []
    extracted_docs = []
    total_extraction_cost = 0.0

    for ctx, (extracted_data, in_t, out_t, cost) in zip(file_contexts, extraction_results):
        extracted_docs.append({
            "filename": ctx["filename"],
            "extracted_data": extracted_data,
            "input_tokens": in_t,
            "output_tokens": out_t,
            "cost_usd": cost
        })
        
        gemini_supp_name = extracted_data.get("certificateOwnerName", supplier_name)
        total_extraction_cost += cost

        doc_evidence = DocumentEvidence(
            audit_id=temp_audit_id,
            supplier_id=0,  # Populated by sheets service
            timestamp=timestamp,
            supplier_name=supplier_name,
            filename=ctx["filename"],
            ariba_question_label=ctx["ariba_question_label"],
            ariba_qa_answers=ctx["ariba_qa_answers"],
            gemini_extracted_supplier_name=gemini_supp_name,
            gemini_extracted_metadata=json.dumps(extracted_data),
            file_content_type=ctx["content_type"],
            input_tokens=in_t,
            output_tokens=out_t,
            cost_usd=cost,
            cost_myr=cost * 4.70,
            file_hash=ctx["file_hash"],
            file_url=ctx.get("file_url")
        )
        doc_evidences.append(doc_evidence)

    # Commented out the audit path to end the flow at document extraction as requested
    # Run overall validation comparison report using Gemini
    # comparison, comp_in_t, comp_out_t, comp_cost = await asyncio.to_thread(
    #     gemini.run_audit_comparison,
    #     qa_data,
    #     json.dumps(extracted_docs)
    # )
    
    # Placeholder values because comparison audit is skipped
    comp_in_t = 0
    comp_out_t = 0
    comp_cost = 0.0
    comp_cost_myr = 0.0
    audit_result = "Extracted"
    suggested_comment = "Document extraction completed successfully (Comparison skipped)."
    
    # Try to extract expiration date from first document
    expiration_date = "N/A"
    if extracted_docs:
        expiration_date = extracted_docs[0]["extracted_data"].get("expirationDate", "N/A")

    total_run_cost = total_extraction_cost + comp_cost
    total_run_cost_myr = total_run_cost * 4.70

    # Save log records to Supplier_List and Document_Evidence only (Audit_Results skipped)
    resolved_audit_id = sheets.log_audit_run(supplier_name, doc_evidences, None)
    supplier_id = doc_evidences[0].supplier_id if doc_evidences else 0
    
    if not resolved_audit_id:
        resolved_audit_id = temp_audit_id
        suggested_comment += " (Warning: Google Sheets database log failed)"

    return AuditResultResponse(
        audit_id=resolved_audit_id,
        supplier_id=supplier_id,
        supplier_name=supplier_name,
        workspace_title=workspace_title,
        cert_type=cert_type,
        filename=", ".join(saved_filenames),
        result=audit_result,
        expiration_date=expiration_date,
        suggested_comment=suggested_comment,
        screenshot_url=screenshot_url,
        comparison_input_tokens=comp_in_t,
        comparison_output_tokens=comp_out_t,
        comparison_cost_usd=comp_cost,
        comparison_cost_myr=comp_cost_myr,
        total_run_cost_usd=total_run_cost,
        total_run_cost_myr=total_run_cost_myr
    )

@app.get("/api/logs/{supplier_name}/assets")
def get_supplier_assets(supplier_name: str):
    """
    Scans the local storage uploads directory for files and screenshots
    belonging to a specific supplier name.
    """
    safe_supplier_name = "".join(c for c in supplier_name if c.isalnum() or c in (" ", "_", "-")).strip()
    supplier_dir = os.path.join(settings.upload_dir, safe_supplier_name)
    
    if not os.path.exists(supplier_dir):
        return {"screenshots": [], "documents": []}
        
    files = os.listdir(supplier_dir)
    screenshots = []
    documents = []
    
    for f in files:
        file_path = f"/static/{safe_supplier_name}/{f}"
        if f.startswith("screenshot_") and f.endswith(".png"):
            screenshots.append(file_path)
        elif not f.startswith(".") and f != "dummy_cert.pdf":
            documents.append({
                "name": f,
                "url": file_path
            })
            
    return {"screenshots": screenshots, "documents": documents}


