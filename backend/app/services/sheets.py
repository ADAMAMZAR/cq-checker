import json
import logging
import re
from datetime import datetime
from typing import List, Dict, Any, Optional
import gspread
from google.oauth2.service_account import Credentials
from app.config import settings
from app.schemas import SupplierEntry, DocumentEvidence, AuditLogEntry

logger = logging.getLogger(__name__)

def get_sheets_client() -> gspread.Client:
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive"
    ]
    
    if settings.google_creds_json:
        try:
            creds_info = json.loads(settings.google_creds_json)
            creds = Credentials.from_service_account_info(creds_info, scopes=scopes)
            return gspread.authorize(creds)
        except Exception as e:
            logger.error(f"Failed to authenticate with GOOGLE_CREDS_JSON: {e}")
            raise e
            
    # Try local credentials path
    try:
        creds = Credentials.from_service_account_file(settings.google_creds_path, scopes=scopes)
        return gspread.authorize(creds)
    except Exception as e:
        logger.warning(f"Failed to authenticate with local file {settings.google_creds_path}: {e}")
        return gspread.service_account(filename=settings.google_creds_path)

def get_or_create_worksheet(client: gspread.Client, title: str, headers: List[str]) -> gspread.Worksheet:
    """
    Opens a worksheet in the spreadsheet.
    Creates it with default headers if not found.
    """
    try:
        spreadsheet = client.open(settings.google_sheet_name)
    except gspread.SpreadsheetNotFound:
        logger.error(f"Spreadsheet '{settings.google_sheet_name}' not found. Verify access rules.")
        raise

    try:
        worksheet = spreadsheet.worksheet(title)
    except gspread.WorksheetNotFound:
        logger.info(f"Worksheet '{title}' not found. Creating a new one...")
        worksheet = spreadsheet.add_worksheet(title=title, rows="1000", cols="20")
        worksheet.append_row(headers, table_range="A1")
    else:
        # Check if empty, append headers if so
        values = worksheet.get_all_values()
        if not values or len(values) == 0:
            worksheet.append_row(headers, table_range="A1")
        else:
            # Check if header row is incomplete (e.g. missing newly added tracking columns)
            existing_headers = values[0]
            if len(existing_headers) < len(headers):
                logger.info(f"Updating incomplete header row for worksheet '{title}'")
                try:
                    worksheet.update("A1", [headers])
                except Exception as e:
                    logger.warning(f"Could not update header row for worksheet '{title}': {e}")
            
    return worksheet


def get_or_create_supplier(client: gspread.Client, supplier_name: str) -> int:
    """
    Looks up a supplier in Supplier_List. If not found, assigns a sequential ID and appends it.
    """
    headers = ["Supplier ID", "Supplier Name", "Date Added"]
    sheet = get_or_create_worksheet(client, "Supplier_List", headers)
    
    records = sheet.get_all_records()
    target_name = supplier_name.strip().lower()
    
    # 1. Try to find existing supplier
    for r in records:
        name_val = str(r.get("Supplier Name", "")).strip().lower()
        if name_val == target_name:
            try:
                return int(r.get("Supplier ID"))
            except (ValueError, TypeError):
                continue
                
    # 2. Determine highest ID if new
    highest_id = 0
    for r in records:
        try:
            s_id = int(r.get("Supplier ID", 0))
            if s_id > highest_id:
                highest_id = s_id
        except (ValueError, TypeError):
            continue
            
    new_id = highest_id + 1
    timestamp = datetime.now().strftime("%d/%m/%Y, %H:%M:%S")
    sheet.append_row([new_id, supplier_name, timestamp], table_range="A1")
    logger.info(f"Assigned new Supplier ID {new_id} to '{supplier_name}'.")
    return new_id

def get_next_audit_id(client: gspread.Client) -> str:
    """
    Looks up existing entries in both Audit_Results and Document_Evidence worksheets
    to determine the next sequential Audit ID.
    Example: AUDIT_0001, AUDIT_0002...
    """
    result_headers = [
        "Audit ID", "Supplier ID", "Timestamp", "Supplier Name", "Workspace Title",
        "Certificate Type", "Complete QA Data Dump", "Compiled Extracted Data",
        "Audit Result Verdict", "Expiration Date", "Suggested Comments", "Screenshot URL",
        "Comparison Input Tokens", "Comparison Output Tokens", "Comparison Cost USD", "Total Run Cost USD"
    ]
    doc_headers = [
        "Audit ID", "Supplier ID", "Timestamp", "Supplier Name", "Filename",
        "Ariba Question Label", "Ariba QA Answers", "Gemini Extracted Supplier Name",
        "Gemini Extracted Metadata", "File Content Type", "Input Tokens", "Output Tokens", "Cost USD"
    ]
    
    highest_idx = 0
    pattern = re.compile(r"^AUDIT_(\d+)$", re.IGNORECASE)
    
    # 1. Check Audit_Results
    try:
        results_sheet = get_or_create_worksheet(client, "Audit_Results", result_headers)
        for r in results_sheet.get_all_records():
            audit_id_val = str(r.get("Audit ID", "")).strip()
            match = pattern.match(audit_id_val)
            if match:
                idx = int(match.group(1))
                if idx > highest_idx:
                    highest_idx = idx
    except Exception as e:
        logger.warning(f"Could not read Audit ID from Audit_Results: {e}")
        
    # 2. Check Document_Evidence
    try:
        doc_sheet = get_or_create_worksheet(client, "Document_Evidence", doc_headers)
        for r in doc_sheet.get_all_records():
            audit_id_val = str(r.get("Audit ID", "")).strip()
            match = pattern.match(audit_id_val)
            if match:
                idx = int(match.group(1))
                if idx > highest_idx:
                    highest_idx = idx
    except Exception as e:
        logger.warning(f"Could not read Audit ID from Document_Evidence: {e}")
                
    next_idx = highest_idx + 1
    return f"AUDIT_{next_idx:04d}"

def log_audit_run(supplier_name: str, doc_evidences: List[DocumentEvidence], audit_log: Optional[AuditLogEntry] = None) -> Optional[str]:
    """
    Logs the documents to Document_Evidence and optionally the overall result to Audit_Results worksheets.
    Links both tables using a sequentially resolved Supplier ID and sequential Audit ID.
    Returns the generated Audit ID.
    """
    try:
        client = get_sheets_client()
        
        # 1. Resolve Supplier ID
        supplier_id = get_or_create_supplier(client, supplier_name)
        
        # 2. Resolve next sequential Audit ID
        audit_id = get_next_audit_id(client)
        
        # 3. Update models with resolved Supplier ID and Audit ID
        for doc in doc_evidences:
            doc.supplier_id = supplier_id
            doc.audit_id = audit_id
        if audit_log:
            audit_log.supplier_id = supplier_id
            audit_log.audit_id = audit_id

        # 4. Log documents to Document_Evidence
        doc_headers = [
            "Audit ID",
            "Supplier ID",
            "Timestamp",
            "Supplier Name",
            "Filename",
            "Ariba Question Label",
            "Ariba QA Answers",
            "Gemini Extracted Supplier Name",
            "Gemini Extracted Metadata",
            "File Content Type",
            "Input Tokens",
            "Output Tokens",
            "Cost USD"
        ]
        doc_sheet = get_or_create_worksheet(client, "Document_Evidence", doc_headers)
        
        doc_rows = []
        for doc in doc_evidences:
            doc_rows.append([
                doc.audit_id,
                doc.supplier_id,
                doc.timestamp,
                doc.supplier_name,
                doc.filename,
                doc.ariba_question_label,
                doc.ariba_qa_answers,
                doc.gemini_extracted_supplier_name,
                doc.gemini_extracted_metadata,
                doc.file_content_type,
                doc.input_tokens,
                doc.output_tokens,
                doc.cost_usd
            ])
        if doc_rows:
            doc_sheet.append_rows(doc_rows, table_range="A1")

        # 5. Log summary audit verdict to Audit_Results (only if audit_log is provided)
        if audit_log:
            result_headers = [
                "Audit ID",
                "Supplier ID",
                "Timestamp",
                "Supplier Name",
                "Workspace Title",
                "Certificate Type",
                "Complete QA Data Dump",
                "Compiled Extracted Data",
                "Audit Result Verdict",
                "Expiration Date",
                "Suggested Comments",
                "Screenshot URL",
                "Comparison Input Tokens",
                "Comparison Output Tokens",
                "Comparison Cost USD",
                "Total Run Cost USD"
            ]
            results_sheet = get_or_create_worksheet(client, "Audit_Results", result_headers)
            results_row = [
                audit_log.audit_id,
                audit_log.supplier_id,
                audit_log.timestamp,
                audit_log.supplier_name,
                audit_log.workspace_title,
                audit_log.cert_type,
                audit_log.complete_qa_data_dump,
                audit_log.compiled_extracted_data,
                audit_log.result,
                audit_log.expiration_date,
                audit_log.suggested_comment,
                audit_log.screenshot_url,
                audit_log.comparison_input_tokens,
                audit_log.comparison_output_tokens,
                audit_log.comparison_cost_usd,
                audit_log.total_run_cost_usd
            ]
            results_sheet.append_row(results_row, table_range="A1")
        
        return audit_id
    except Exception as e:
        logger.error(f"Failed to write relational log tables to Google Sheets: {e}")
        return None

def get_audit_logs() -> List[AuditLogEntry]:
    """
    Fetches all audit results logs from the Audit_Results worksheet in Google Sheets.
    """
    try:
        client = get_sheets_client()
        result_headers = [
            "Audit ID", "Supplier ID", "Timestamp", "Supplier Name", "Workspace Title",
            "Certificate Type", "Complete QA Data Dump", "Compiled Extracted Data",
            "Audit Result Verdict", "Expiration Date", "Suggested Comments", "Screenshot URL",
            "Comparison Input Tokens", "Comparison Output Tokens", "Comparison Cost USD", "Total Run Cost USD"
        ]
        sheet = get_or_create_worksheet(client, "Audit_Results", result_headers)
        
        values = sheet.get_all_values()
        if not values or len(values) <= 1:
            return []
            
        records = sheet.get_all_records()
        logs = []
        for r in records:
            logs.append(AuditLogEntry(
                audit_id=str(r.get("Audit ID", "")),
                supplier_id=int(r.get("Supplier ID", 0)),
                timestamp=str(r.get("Timestamp", "")),
                supplier_name=str(r.get("Supplier Name", "")),
                workspace_title=str(r.get("Workspace Title", "")),
                cert_type=str(r.get("Certificate Type", "")),
                complete_qa_data_dump=str(r.get("Complete QA Data Dump", "")),
                compiled_extracted_data=str(r.get("Compiled Extracted Data", "")),
                result=str(r.get("Audit Result Verdict", "")),
                expiration_date=str(r.get("Expiration Date", "")),
                suggested_comment=str(r.get("Suggested Comments", "")),
                screenshot_url=str(r.get("Screenshot URL", "")) if r.get("Screenshot URL") else None,
                comparison_input_tokens=int(r.get("Comparison Input Tokens", 0)) if r.get("Comparison Input Tokens") else 0,
                comparison_output_tokens=int(r.get("Comparison Output Tokens", 0)) if r.get("Comparison Output Tokens") else 0,
                comparison_cost_usd=float(r.get("Comparison Cost USD", 0.0)) if r.get("Comparison Cost USD") else 0.0,
                total_run_cost_usd=float(r.get("Total Run Cost USD", 0.0)) if r.get("Total Run Cost USD") else 0.0
            ))
        return logs
    except Exception as e:
        logger.error(f"Failed to fetch rows from Audit_Results worksheet: {e}")
        return []

def get_document_evidence_logs() -> List[DocumentEvidence]:
    """
    Fetches all historical logs from the Document_Evidence worksheet in Google Sheets.
    """
    try:
        client = get_sheets_client()
        doc_headers = [
            "Audit ID", "Supplier ID", "Timestamp", "Supplier Name", "Filename",
            "Ariba Question Label", "Ariba QA Answers", "Gemini Extracted Supplier Name",
            "Gemini Extracted Metadata", "File Content Type", "Input Tokens", "Output Tokens", "Cost USD"
        ]
        sheet = get_or_create_worksheet(client, "Document_Evidence", doc_headers)
        
        values = sheet.get_all_values()
        if not values or len(values) <= 1:
            return []
            
        records = sheet.get_all_records()
        logs = []
        for r in records:
            logs.append(DocumentEvidence(
                audit_id=str(r.get("Audit ID", "")),
                supplier_id=int(r.get("Supplier ID", 0)),
                timestamp=str(r.get("Timestamp", "")),
                supplier_name=str(r.get("Supplier Name", "")),
                filename=str(r.get("Filename", "")),
                ariba_question_label=str(r.get("Ariba Question Label", "")),
                ariba_qa_answers=str(r.get("Ariba QA Answers", "")),
                gemini_extracted_supplier_name=str(r.get("Gemini Extracted Supplier Name", "")),
                gemini_extracted_metadata=str(r.get("Gemini Extracted Metadata", "")),
                file_content_type=str(r.get("File Content Type", "")),
                input_tokens=int(r.get("Input Tokens", 0)) if r.get("Input Tokens") else 0,
                output_tokens=int(r.get("Output Tokens", 0)) if r.get("Output Tokens") else 0,
                cost_usd=float(r.get("Cost USD", 0.0)) if r.get("Cost USD") else 0.0
            ))
        return logs
    except Exception as e:
        logger.error(f"Failed to fetch rows from Document_Evidence worksheet: {e}")
        return []

def update_document_evidence(audit_id: str, filename: str, updated_metadata: Dict[str, Any]) -> bool:
    """
    Finds a record in Document_Evidence sheet by Audit ID and Filename,
    and updates its extracted metadata JSON string.
    """
    try:
        client = get_sheets_client()
        doc_headers = [
            "Audit ID", "Supplier ID", "Timestamp", "Supplier Name", "Filename",
            "Ariba Question Label", "Ariba QA Answers", "Gemini Extracted Supplier Name",
            "Gemini Extracted Metadata", "File Content Type", "Input Tokens", "Output Tokens", "Cost USD"
        ]
        sheet = get_or_create_worksheet(client, "Document_Evidence", doc_headers)
        
        records = sheet.get_all_records()
        for idx, r in enumerate(records, start=2): # Row 1 is header, data starts at row 2
            r_audit_id = str(r.get("Audit ID", "")).strip()
            r_filename = str(r.get("Filename", "")).strip()
            if r_audit_id == audit_id and r_filename == filename:
                # Update Column 9 (Gemini Extracted Metadata)
                sheet.update_cell(idx, 9, json.dumps(updated_metadata))
                
                # Also update Column 8 (Gemini Extracted Supplier Name) if certificateOwnerName is provided
                owner_name = updated_metadata.get("certificateOwnerName")
                if owner_name:
                    sheet.update_cell(idx, 8, owner_name)
                return True
        logger.warning(f"Could not find Document Evidence record matching Audit ID '{audit_id}' and Filename '{filename}' to update.")
        return False
    except Exception as e:
        logger.error(f"Failed to update document evidence in Google Sheets: {e}")
        return False

