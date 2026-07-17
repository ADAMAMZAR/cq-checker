import sys
# Force python to raise ImportError when attempting to load the incompatible C-extension
sys.modules['google._upb._message'] = None

import os
# Force pure Python implementation of Protobuf to bypass Python 3.14 C-extension incompatibilities
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

import json
import shutil
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.schemas import AuditLogEntry, AuditResultResponse
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
        with open(screenshot_path, "wb") as buffer:
            shutil.copyfileobj(screenshot.file, buffer)
        # Construct access URL
        screenshot_url = f"/static/{safe_supplier_name}/{screenshot_filename}"

    # For Phase 2: Live Gemini Audit Pipeline
    # 1. Read files and extract text/JSON from each certificate using Gemini 2.5 Flash
    extracted_docs = []
    for file in files:
        # Seek to start in case stream was partially consumed
        await file.seek(0)
        file_bytes = await file.read()
        mime_type = file.content_type or "application/pdf"
        
        extracted_data = gemini.extract_certificate_data(file_bytes, mime_type)
        extracted_docs.append({
            "filename": file.filename,
            "extracted_data": extracted_data
        })
    
    # 2. Compare extracted data against QA form inputs using Gemini 2.5 Flash
    compiled_json_text = json.dumps(extracted_docs, indent=2)
    audit_report = gemini.run_audit_comparison(qa_data, compiled_json_text)
    
    audit_result = audit_report.get("result", "Mismatch")
    expiration_date = audit_report.get("expiration_date", "N/A")
    suggested_comment = audit_report.get("suggested_comment", "No comments.")

    # Write log entry to Google Sheets
    timestamp = datetime.now().strftime("%d/%m/%Y, %H:%M:%S")
    log_entry = AuditLogEntry(
        timestamp=timestamp,
        supplier_name=supplier_name,
        workspace_title=workspace_title,
        cert_type=cert_type,
        filename=", ".join(saved_filenames),
        result=audit_result,
        expiration_date=expiration_date,
        suggested_comment=suggested_comment
    )
    
    success = sheets.append_audit_log(log_entry)
    if not success:
        # Log error locally, but do not fail the network request
        suggested_comment += " (Warning: Google Sheets database log failed)"

    return AuditResultResponse(
        supplier_name=supplier_name,
        workspace_title=workspace_title,
        cert_type=cert_type,
        filename=", ".join(saved_filenames),
        result=audit_result,
        expiration_date=expiration_date,
        suggested_comment=suggested_comment,
        screenshot_url=screenshot_url
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


