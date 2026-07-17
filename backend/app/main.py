import json
import os
import shutil
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.schemas import AuditLogEntry, AuditResultResponse
from app.services import sheets

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
    Saves attachments locally, triggers the audit (mocked for Phase 1),
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

    # For Phase 1: Mocked Audit Pipeline
    # Real Gemini integration will be added in Phase 2
    mock_result = "Match"
    mock_expiration_date = "2029-12-31"
    mock_comment = f"Audit completed successfully. Supplier: {supplier_name}. Files verified: {', '.join(saved_filenames)}."

    # Write log entry to Google Sheets
    timestamp = datetime.now().strftime("%d/%m/%Y, %H:%M:%S")
    log_entry = AuditLogEntry(
        timestamp=timestamp,
        supplier_name=supplier_name,
        workspace_title=workspace_title,
        cert_type=cert_type,
        filename=", ".join(saved_filenames),
        result=mock_result,
        expiration_date=mock_expiration_date,
        suggested_comment=mock_comment
    )
    
    success = sheets.append_audit_log(log_entry)
    if not success:
        # We don't fail the request, but log it and warn the extension
        mock_comment += " (Warning: Google Sheets database log failed)"

    return AuditResultResponse(
        supplier_name=supplier_name,
        workspace_title=workspace_title,
        cert_type=cert_type,
        filename=", ".join(saved_filenames),
        result=mock_result,
        expiration_date=mock_expiration_date,
        suggested_comment=mock_comment,
        screenshot_url=screenshot_url
    )
