import json
import logging
import re
from datetime import datetime
from typing import List, Dict, Any, Optional
import gspread
from google.oauth2.service_account import Credentials
import requests
import google.auth
import google.auth.transport.requests
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

def parse_dynamic_log_fields(compiled_extracted_data: str, suggested_comment: str) -> tuple[str, str, str, str, str]:
    """
    Parses workspace_title, cert_type, complete_qa_data_dump, result, and expiration_date dynamically.
    Returns: (workspace_title, cert_type, complete_qa_data_dump, result, expiration_date)
    """
    # 1. result
    result = "Match"
    if "Mismatch" in suggested_comment or "revise" in suggested_comment.lower():
        result = "Mismatch"

    # 2. expiration_date and cert_type
    expiration_date = "N/A"
    cert_type = "Relational evidence"
    try:
        if compiled_extracted_data:
            extracted_docs = json.loads(compiled_extracted_data)
            if extracted_docs and isinstance(extracted_docs, list):
                first_doc = extracted_docs[0]
                extracted_data = first_doc.get("extracted_data", {})
                expiration_date = extracted_data.get("expirationDate", "N/A")
                cert_type = extracted_data.get("certificateType", "Relational evidence")
    except Exception:
        pass

    workspace_title = "Ariba Workspace"
    complete_qa_data_dump = "[]"

    return workspace_title, cert_type, complete_qa_data_dump, result, expiration_date


def get_next_audit_id(client: gspread.Client) -> str:
    """
    Looks up existing entries in both Audit_Results and Document_Evidence worksheets
    to determine the next sequential Audit ID.
    Example: AUDIT_0001, AUDIT_0002...
    """
    result_headers = [
        "Audit ID", "Supplier ID", "Timestamp", "Supplier Name", "Compiled Extracted Data",
        "Suggested Comments", "Screenshot URL", "Comparison Table JSON",
        "Comparison Input Tokens", "Comparison Output Tokens", "Comparison Cost USD", "Comparison Cost MYR",
        "Total Run Cost USD", "Total Run Cost MYR"
    ]
    doc_headers = [
        "Audit ID", "Supplier ID", "Timestamp", "Supplier Name", "Filename",
        "Ariba Question Label", "Ariba QA Answers", "Gemini Extracted Supplier Name",
        "Gemini Extracted Metadata", "File Content Type", "Input Tokens", "Output Tokens", "Cost USD", "Cost MYR", "File Hash"
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
    if settings.supabase_url and settings.supabase_key:
        return log_audit_run_via_supabase(supplier_name, doc_evidences, audit_log)
    if settings.google_apps_script_url:
        return log_audit_run_via_apps_script(supplier_name, doc_evidences, audit_log)
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
            "Cost USD",
            "Cost MYR",
            "File Hash"
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
                doc.cost_usd,
                doc.cost_myr,
                doc.file_hash
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
                "Compiled Extracted Data",
                "Suggested Comments",
                "Screenshot URL",
                "Comparison Table JSON",
                "Comparison Input Tokens",
                "Comparison Output Tokens",
                "Comparison Cost USD",
                "Comparison Cost MYR",
                "Total Run Cost USD",
                "Total Run Cost MYR"
            ]
            results_sheet = get_or_create_worksheet(client, "Audit_Results", result_headers)
            results_row = [
                audit_log.audit_id,
                audit_log.supplier_id,
                audit_log.timestamp,
                audit_log.supplier_name,
                audit_log.compiled_extracted_data,
                audit_log.suggested_comment,
                audit_log.screenshot_url,
                json.dumps(audit_log.comparison_table) if audit_log.comparison_table else None,
                audit_log.comparison_input_tokens,
                audit_log.comparison_output_tokens,
                audit_log.comparison_cost_usd,
                audit_log.comparison_cost_myr,
                audit_log.total_run_cost_usd,
                audit_log.total_run_cost_myr
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
    if settings.supabase_url and settings.supabase_key:
        return get_audit_logs_via_supabase()
    if settings.google_apps_script_url:
        return get_audit_logs_via_apps_script()
    try:
        client = get_sheets_client()
        result_headers = [
            "Audit ID", "Supplier ID", "Timestamp", "Supplier Name", "Compiled Extracted Data",
            "Suggested Comments", "Screenshot URL", "Comparison Table JSON",
            "Comparison Input Tokens", "Comparison Output Tokens", "Comparison Cost USD", "Comparison Cost MYR",
            "Total Run Cost USD", "Total Run Cost MYR"
        ]
        sheet = get_or_create_worksheet(client, "Audit_Results", result_headers)
        
        values = sheet.get_all_values()
        if not values or len(values) <= 1:
            return []
            
        records = sheet.get_all_records()
        logs = []
        for r in records:
            compiled_data = str(r.get("Compiled Extracted Data", ""))
            comments = str(r.get("Suggested Comments", ""))
            comp_table_str = str(r.get("Comparison Table JSON", ""))
            comp_table_json = None
            if comp_table_str:
                try:
                    comp_table_json = json.loads(comp_table_str)
                except Exception:
                    pass
            
            # Resolve removed columns dynamically
            w_title, c_type, qa_dump, res, exp_date = parse_dynamic_log_fields(compiled_data, comments)
            
            logs.append(AuditLogEntry(
                audit_id=str(r.get("Audit ID", "")),
                supplier_id=int(r.get("Supplier ID", 0)),
                timestamp=str(r.get("Timestamp", "")),
                supplier_name=str(r.get("Supplier Name", "")),
                workspace_title=w_title,
                cert_type=c_type,
                complete_qa_data_dump=qa_dump,
                compiled_extracted_data=compiled_data,
                result=res,
                expiration_date=exp_date,
                suggested_comment=comments,
                screenshot_url=str(r.get("Screenshot URL", "")) if r.get("Screenshot URL") else None,
                comparison_input_tokens=int(r.get("Comparison Input Tokens", 0)) if r.get("Comparison Input Tokens") else 0,
                comparison_output_tokens=int(r.get("Comparison Output Tokens", 0)) if r.get("Comparison Output Tokens") else 0,
                comparison_cost_usd=float(r.get("Comparison Cost USD", 0.0)) if r.get("Comparison Cost USD") else 0.0,
                comparison_cost_myr=float(r.get("Comparison Cost MYR", 0.0)) if r.get("Comparison Cost MYR") else 0.0,
                total_run_cost_usd=float(r.get("Total Run Cost USD", 0.0)) if r.get("Total Run Cost USD") else 0.0,
                total_run_cost_myr=float(r.get("Total Run Cost MYR", 0.0)) if r.get("Total Run Cost MYR") else 0.0,
                comparison_table=comp_table_json
            ))
        return logs
    except Exception as e:
        logger.error(f"Failed to fetch rows from Audit_Results worksheet: {e}")
        return []

def get_document_evidence_logs() -> List[DocumentEvidence]:
    """
    Fetches all historical logs from the Document_Evidence worksheet in Google Sheets.
    """
    if settings.supabase_url and settings.supabase_key:
        return get_document_evidence_logs_via_supabase()
    if settings.google_apps_script_url:
        return get_document_evidence_logs_via_apps_script()
    try:
        client = get_sheets_client()
        doc_headers = [
            "Audit ID", "Supplier ID", "Timestamp", "Supplier Name", "Filename",
            "Ariba Question Label", "Ariba QA Answers", "Gemini Extracted Supplier Name",
            "Gemini Extracted Metadata", "File Content Type", "Input Tokens", "Output Tokens", "Cost USD", "Cost MYR", "File Hash"
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
                cost_usd=float(r.get("Cost USD", 0.0)) if r.get("Cost USD") else 0.0,
                cost_myr=float(r.get("Cost MYR", 0.0)) if r.get("Cost MYR") else 0.0,
                file_hash=str(r.get("File Hash", "")) if r.get("File Hash") else None
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
    if settings.supabase_url and settings.supabase_key:
        return update_document_evidence_via_supabase(audit_id, filename, updated_metadata)
    if settings.google_apps_script_url:
        return update_document_evidence_via_apps_script(audit_id, filename, updated_metadata)
    try:
        client = get_sheets_client()
        doc_headers = [
            "Audit ID", "Supplier ID", "Timestamp", "Supplier Name", "Filename",
            "Ariba Question Label", "Ariba QA Answers", "Gemini Extracted Supplier Name",
            "Gemini Extracted Metadata", "File Content Type", "Input Tokens", "Output Tokens", "Cost USD", "Cost MYR", "File Hash"
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

def find_metadata_by_hash(file_hash: str, ariba_question_label: str) -> Optional[Dict[str, Any]]:
    """
    Searches Document_Evidence sheet for a record with the given file hash and question label.
    Returns the most recent Gemini Extracted Supplier Name and Gemini Extracted Metadata if found.
    """
    if settings.supabase_url and settings.supabase_key:
        return find_metadata_by_hash_via_supabase(file_hash, ariba_question_label)
    if settings.google_apps_script_url:
        return find_metadata_by_hash_via_apps_script(file_hash, ariba_question_label)
    try:
        client = get_sheets_client()
        doc_headers = [
            "Audit ID", "Supplier ID", "Timestamp", "Supplier Name", "Filename",
            "Ariba Question Label", "Ariba QA Answers", "Gemini Extracted Supplier Name",
            "Gemini Extracted Metadata", "File Content Type", "Input Tokens", "Output Tokens", "Cost USD", "Cost MYR", "File Hash"
        ]
        sheet = get_or_create_worksheet(client, "Document_Evidence", doc_headers)
        records = sheet.get_all_records()
        
        # Search backwards (latest first)
        for r in reversed(records):
            r_hash = str(r.get("File Hash", "")).strip()
            r_label = str(r.get("Ariba Question Label", "")).strip()
            if r_hash and r_hash == file_hash and r_label == ariba_question_label:
                return {
                    "gemini_extracted_supplier_name": str(r.get("Gemini Extracted Supplier Name", "")),
                    "gemini_extracted_metadata": str(r.get("Gemini Extracted Metadata", ""))
                }
        return None
    except Exception as e:
        logger.error(f"Failed to find metadata by hash in Google Sheets: {e}")
        return None

# ---------------------------------------------------------------------------
# Supabase Cloud Database Integration Functions
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

def get_or_create_supplier_via_supabase(supplier_name: str) -> int:
    records = call_supabase_select("supplier_list", {"supplier_name": f"ilike.{supplier_name.strip()}"})
    if records:
        try:
            return int(records[0]["supplier_id"])
        except (ValueError, TypeError, KeyError):
            pass
            
    all_suppliers = call_supabase_select("supplier_list")
    highest_id = 0
    for s in all_suppliers:
        try:
            s_id = int(s["supplier_id"])
            if s_id > highest_id:
                highest_id = s_id
        except (ValueError, TypeError, KeyError):
            continue
            
    new_id = highest_id + 1
    timestamp = datetime.now().strftime("%d/%m/%Y, %H:%M:%S")
    call_supabase_insert("supplier_list", [{
        "supplier_id": new_id,
        "supplier_name": supplier_name,
        "date_added": timestamp
    }])
    return new_id

def get_next_audit_id_via_supabase() -> str:
    highest_idx = 0
    pattern = re.compile(r"^AUDIT_(\d+)$", re.IGNORECASE)
    
    results_records = call_supabase_select("audit_results")
    for r in results_records:
        audit_id_val = str(r.get("audit_id", "")).strip()
        match = pattern.match(audit_id_val)
        if match:
            idx = int(match.group(1))
            if idx > highest_idx:
                highest_idx = idx
                
    doc_records = call_supabase_select("document_evidence")
    for r in doc_records:
        audit_id_val = str(r.get("audit_id", "")).strip()
        match = pattern.match(audit_id_val)
        if match:
            idx = int(match.group(1))
            if idx > highest_idx:
                highest_idx = idx
                
    next_idx = highest_idx + 1
    return f"AUDIT_{next_idx:04d}"

def log_audit_run_via_supabase(supplier_name: str, doc_evidences: List[DocumentEvidence], audit_log: Optional[AuditLogEntry] = None) -> Optional[str]:
    try:
        supplier_id = get_or_create_supplier_via_supabase(supplier_name)
        audit_id = get_next_audit_id_via_supabase()
        
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
                "cost_myr": doc.cost_myr,
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
                "compiled_extracted_data": audit_log.compiled_extracted_data,
                "suggested_comments": audit_log.suggested_comment,
                "screenshot_url": audit_log.screenshot_url,
                "comparison_table": audit_log.comparison_table,
                "comparison_input_tokens": audit_log.comparison_input_tokens,
                "comparison_output_tokens": audit_log.comparison_output_tokens,
                "comparison_cost_usd": audit_log.comparison_cost_usd,
                "comparison_cost_myr": audit_log.comparison_cost_myr,
                "total_run_cost_usd": audit_log.total_run_cost_usd,
                "total_run_cost_myr": audit_log.total_run_cost_myr
            }]
            call_supabase_insert("audit_results", results_row)

        return audit_id
    except Exception as e:
        logger.error(f"Failed to log audit run via Supabase: {e}")
        return None

def get_audit_logs_via_supabase() -> List[AuditLogEntry]:
    records = call_supabase_select("audit_results")
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

        # Resolve removed columns dynamically
        w_title, c_type, qa_dump, res, exp_date = parse_dynamic_log_fields(compiled_data, comments)

        logs.append(AuditLogEntry(
            audit_id=str(r.get("audit_id", "")),
            supplier_id=int(r.get("supplier_id", 0)),
            timestamp=str(r.get("timestamp", "")),
            supplier_name=str(r.get("supplier_name", "")),
            workspace_title=w_title,
            cert_type=c_type,
            complete_qa_data_dump=qa_dump,
            compiled_extracted_data=compiled_data,
            result=res,
            expiration_date=exp_date,
            suggested_comment=comments,
            screenshot_url=str(r.get("screenshot_url", "")) if r.get("screenshot_url") else None,
            comparison_input_tokens=int(r.get("comparison_input_tokens", 0)) if r.get("comparison_input_tokens") else 0,
            comparison_output_tokens=int(r.get("comparison_output_tokens", 0)) if r.get("comparison_output_tokens") else 0,
            comparison_cost_usd=float(r.get("comparison_cost_usd", 0.0)) if r.get("comparison_cost_usd") else 0.0,
            comparison_cost_myr=float(r.get("comparison_cost_myr", 0.0)) if r.get("comparison_cost_myr") else 0.0,
            total_run_cost_usd=float(r.get("total_run_cost_usd", 0.0)) if r.get("total_run_cost_usd") else 0.0,
            total_run_cost_myr=float(r.get("total_run_cost_myr", 0.0)) if r.get("total_run_cost_myr") else 0.0,
            comparison_table=comp_table
        ))
    return logs

def get_document_evidence_logs_via_supabase() -> List[DocumentEvidence]:
    records = call_supabase_select("document_evidence")
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
            cost_myr=float(r.get("cost_myr", 0.0)) if r.get("cost_myr") else 0.0,
            file_hash=str(r.get("file_hash", "")) if r.get("file_hash") else None,
            file_url=str(r.get("file_url", "")) if r.get("file_url") else None
        ))
    return logs

def update_document_evidence_via_supabase(audit_id: str, filename: str, updated_metadata: Dict[str, Any]) -> bool:
    filters = {"audit_id": f"eq.{audit_id}", "filename": f"eq.{filename}"}
    updates = {
        "gemini_extracted_metadata": json.dumps(updated_metadata)
    }
    owner_name = updated_metadata.get("certificateOwnerName")
    if owner_name:
        updates["gemini_extracted_supplier_name"] = owner_name
        
    return call_supabase_update("document_evidence", filters, updates)

def find_metadata_by_hash_via_supabase(file_hash: str, ariba_question_label: str) -> Optional[Dict[str, Any]]:
    records = call_supabase_select("document_evidence", {
        "file_hash": f"eq.{file_hash}",
        "ariba_question_label": f"eq.{ariba_question_label}",
        "order": "id.desc"
    })
    if records:
        r = records[0]
        return {
            "gemini_extracted_supplier_name": str(r.get("gemini_extracted_supplier_name", "")),
            "gemini_extracted_metadata": str(r.get("gemini_extracted_metadata", ""))
        }
    return None

# ---------------------------------------------------------------------------
# Google Apps Script Web App Integration Functions
# ---------------------------------------------------------------------------

def get_google_access_token() -> str:
    try:
        # Load local Google application default credentials
        # (Generated by running `gcloud auth application-default login` on your terminal)
        credentials, project = google.auth.default(scopes=[
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive"
        ])
        
        # Refresh token to get a fresh access token
        auth_request = google.auth.transport.requests.Request()
        credentials.refresh(auth_request)
        return credentials.token
    except Exception as e:
        logger.error(f"Failed to fetch Google Access Token (run 'gcloud auth application-default login'): {e}")
        return ""

def call_apps_script_get(sheet_name: str, action: str = "get_records") -> List[Dict[str, Any]]:
    if not settings.google_apps_script_url:
        return []
    try:
        headers = {}
        token = get_google_access_token()
        if token:
            headers["Authorization"] = f"Bearer {token}"
            
        response = requests.get(
            settings.google_apps_script_url,
            params={"action": action, "sheet": sheet_name},
            headers=headers,
            timeout=15
        )
        if response.status_code == 200:
            try:
                return response.json()
            except ValueError as je:
                logger.error(f"Apps Script GET succeeded with 200 but returned non-JSON content. First 250 chars: {response.text[:250]}")
                raise je
        logger.error(f"Apps Script GET failed: {response.status_code} - {response.text[:250]}")
        return []
    except Exception as e:
        logger.error(f"Apps Script GET exception: {e}")
        return []

def call_apps_script_post(payload: Dict[str, Any]) -> bool:
    if not settings.google_apps_script_url:
        return False
    try:
        headers = {"Content-Type": "application/json"}
        token = get_google_access_token()
        if token:
            headers["Authorization"] = f"Bearer {token}"
            
        response = requests.post(
            settings.google_apps_script_url,
            json=payload,
            headers=headers,
            timeout=15
        )
        if response.status_code == 200:
            return True
        logger.error(f"Apps Script POST failed: {response.status_code} - {response.text[:250]}")
        return False
    except Exception as e:
        logger.error(f"Apps Script POST exception: {e}")
        return False

def get_or_create_supplier_via_apps_script(supplier_name: str) -> int:
    records = call_apps_script_get("Supplier_List")
    target_name = supplier_name.strip().lower()
    
    for r in records:
        name_val = str(r.get("Supplier Name", "")).strip().lower()
        if name_val == target_name:
            try:
                return int(r.get("Supplier ID"))
            except (ValueError, TypeError):
                continue
                
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
    
    call_apps_script_post({
        "action": "append_rows",
        "sheet": "Supplier_List",
        "rows": [[new_id, supplier_name, timestamp]],
        "headers": ["Supplier ID", "Supplier Name", "Date Added"]
    })
    return new_id

def get_next_audit_id_via_apps_script() -> str:
    highest_idx = 0
    pattern = re.compile(r"^AUDIT_(\d+)$", re.IGNORECASE)
    
    # Check Audit_Results
    results_records = call_apps_script_get("Audit_Results")
    for r in results_records:
        audit_id_val = str(r.get("Audit ID", "")).strip()
        match = pattern.match(audit_id_val)
        if match:
            idx = int(match.group(1))
            if idx > highest_idx:
                highest_idx = idx
                
    # Check Document_Evidence
    doc_records = call_apps_script_get("Document_Evidence")
    for r in doc_records:
        audit_id_val = str(r.get("Audit ID", "")).strip()
        match = pattern.match(audit_id_val)
        if match:
            idx = int(match.group(1))
            if idx > highest_idx:
                highest_idx = idx
                
    next_idx = highest_idx + 1
    return f"AUDIT_{next_idx:04d}"

def log_audit_run_via_apps_script(supplier_name: str, doc_evidences: List[DocumentEvidence], audit_log: Optional[AuditLogEntry] = None) -> Optional[str]:
    try:
        supplier_id = get_or_create_supplier_via_apps_script(supplier_name)
        audit_id = get_next_audit_id_via_apps_script()
        
        for doc in doc_evidences:
            doc.supplier_id = supplier_id
            doc.audit_id = audit_id
        if audit_log:
            audit_log.supplier_id = supplier_id
            audit_log.audit_id = audit_id

        doc_headers = [
            "Audit ID", "Supplier ID", "Timestamp", "Supplier Name", "Filename",
            "Ariba Question Label", "Ariba QA Answers", "Gemini Extracted Supplier Name",
            "Gemini Extracted Metadata", "File Content Type", "Input Tokens", "Output Tokens", "Cost USD", "Cost MYR", "File Hash"
        ]
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
                doc.cost_usd,
                doc.cost_myr,
                doc.file_hash
            ])
        
        call_apps_script_post({
            "action": "append_rows",
            "sheet": "Document_Evidence",
            "rows": doc_rows,
            "headers": doc_headers
        })
        
        if audit_log:
            result_headers = [
                "Audit ID", "Supplier ID", "Timestamp", "Supplier Name", "Compiled Extracted Data",
                "Suggested Comments", "Screenshot URL", "Comparison Table JSON",
                "Comparison Input Tokens", "Comparison Output Tokens", "Comparison Cost USD", "Comparison Cost MYR",
                "Total Run Cost USD", "Total Run Cost MYR"
            ]
            results_row = [[
                audit_log.audit_id,
                audit_log.supplier_id,
                audit_log.timestamp,
                audit_log.supplier_name,
                audit_log.compiled_extracted_data,
                audit_log.suggested_comment,
                audit_log.screenshot_url,
                json.dumps(audit_log.comparison_table) if audit_log.comparison_table else None,
                audit_log.comparison_input_tokens,
                audit_log.comparison_output_tokens,
                audit_log.comparison_cost_usd,
                audit_log.comparison_cost_myr,
                audit_log.total_run_cost_usd,
                audit_log.total_run_cost_myr
            ]]
            call_apps_script_post({
                "action": "append_rows",
                "sheet": "Audit_Results",
                "rows": results_row,
                "headers": result_headers
            })
        return audit_id
    except Exception as e:
        logger.error(f"Failed to log audit run via Apps Script: {e}")
        return None

def get_audit_logs_via_apps_script() -> List[AuditLogEntry]:
    records = call_apps_script_get("Audit_Results")
    logs = []
    for r in records:
        compiled_data = str(r.get("Compiled Extracted Data", ""))
        comments = str(r.get("Suggested Comments", ""))
        comp_table_str = str(r.get("Comparison Table JSON", ""))
        comp_table_json = None
        if comp_table_str:
            try:
                comp_table_json = json.loads(comp_table_str)
            except Exception:
                pass

        # Resolve removed columns dynamically
        w_title, c_type, qa_dump, res, exp_date = parse_dynamic_log_fields(compiled_data, comments)

        logs.append(AuditLogEntry(
            audit_id=str(r.get("Audit ID", "")),
            supplier_id=int(r.get("Supplier ID", 0)),
            timestamp=str(r.get("Timestamp", "")),
            supplier_name=str(r.get("Supplier Name", "")),
            workspace_title=w_title,
            cert_type=c_type,
            complete_qa_data_dump=qa_dump,
            compiled_extracted_data=compiled_data,
            result=res,
            expiration_date=exp_date,
            suggested_comment=comments,
            screenshot_url=str(r.get("Screenshot URL", "")) if r.get("Screenshot URL") else None,
            comparison_input_tokens=int(r.get("Comparison Input Tokens", 0)) if r.get("Comparison Input Tokens") else 0,
            comparison_output_tokens=int(r.get("Comparison Output Tokens", 0)) if r.get("Comparison Output Tokens") else 0,
            comparison_cost_usd=float(r.get("Comparison Cost USD", 0.0)) if r.get("Comparison Cost USD") else 0.0,
            comparison_cost_myr=float(r.get("Comparison Cost MYR", 0.0)) if r.get("Comparison Cost MYR") else 0.0,
            total_run_cost_usd=float(r.get("Total Run Cost USD", 0.0)) if r.get("Total Run Cost USD") else 0.0,
            total_run_cost_myr=float(r.get("Total Run Cost MYR", 0.0)) if r.get("Total Run Cost MYR") else 0.0,
            comparison_table=comp_table_json
        ))
    return logs

def get_document_evidence_logs_via_apps_script() -> List[DocumentEvidence]:
    records = call_apps_script_get("Document_Evidence")
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
            cost_usd=float(r.get("Cost USD", 0.0)) if r.get("Cost USD") else 0.0,
            cost_myr=float(r.get("Cost MYR", 0.0)) if r.get("Cost MYR") else 0.0,
            file_hash=str(r.get("File Hash", "")) if r.get("File Hash") else None
        ))
    return logs

def update_document_evidence_via_apps_script(audit_id: str, filename: str, updated_metadata: Dict[str, Any]) -> bool:
    return call_apps_script_post({
        "action": "update_evidence",
        "audit_id": audit_id,
        "filename": filename,
        "updated_metadata": json.dumps(updated_metadata)
    })

def find_metadata_by_hash_via_apps_script(file_hash: str, ariba_question_label: str) -> Optional[Dict[str, Any]]:
    records = call_apps_script_get("Document_Evidence")
    for r in reversed(records):
        r_hash = str(r.get("File Hash", "")).strip()
        r_label = str(r.get("Ariba Question Label", "")).strip()
        if r_hash and r_hash == file_hash and r_label == ariba_question_label:
            return {
                "gemini_extracted_supplier_name": str(r.get("Gemini Extracted Supplier Name", "")),
                "gemini_extracted_metadata": str(r.get("Gemini Extracted Metadata", ""))
            }
    return None


def update_audit_result(audit_id: str, result: str, suggested_comment: str, comparison_table: Optional[dict] = None) -> bool:
    """
    Finds a record in Audit_Results sheet by Audit ID and updates its result verdict and suggested comments.
    """
    if settings.supabase_url and settings.supabase_key:
        return update_audit_result_via_supabase(audit_id, result, suggested_comment, comparison_table)
    if settings.google_apps_script_url:
        return update_audit_result_via_apps_script(audit_id, result, suggested_comment, comparison_table)
    try:
        client = get_sheets_client()
        result_headers = [
            "Audit ID", "Supplier ID", "Timestamp", "Supplier Name", "Compiled Extracted Data",
            "Suggested Comments", "Screenshot URL", "Comparison Table JSON",
            "Comparison Input Tokens", "Comparison Output Tokens", "Comparison Cost USD", "Comparison Cost MYR",
            "Total Run Cost USD", "Total Run Cost MYR"
        ]
        sheet = get_or_create_worksheet(client, "Audit_Results", result_headers)

        records = sheet.get_all_records()
        for idx, r in enumerate(records, start=2): # Row 1 is header, data starts at row 2
            r_audit_id = str(r.get("Audit ID", "")).strip()
            if r_audit_id == audit_id:
                # Update Column 6 (Suggested Comments)
                sheet.update_cell(idx, 6, suggested_comment)
                if comparison_table is not None:
                    sheet.update_cell(idx, 8, json.dumps(comparison_table))
                return True
        logger.warning(f"Could not find Audit Results record matching Audit ID '{audit_id}' to update.")
        return False
    except Exception as e:
        logger.error(f"Failed to update audit result in Google Sheets: {e}")
        return False


def update_audit_result_via_supabase(audit_id: str, result: str, suggested_comment: str, comparison_table: Optional[dict] = None) -> bool:
    filters = {"audit_id": f"eq.{audit_id}"}
    updates = {
        "suggested_comments": suggested_comment
    }
    if comparison_table is not None:
        updates["comparison_table"] = comparison_table
    return call_supabase_update("audit_results", filters, updates)


def update_audit_result_via_apps_script(audit_id: str, result: str, suggested_comment: str, comparison_table: Optional[dict] = None) -> bool:
    payload = {
        "action": "update_audit_result",
        "audit_id": audit_id,
        "result": result,
        "suggested_comment": suggested_comment
    }
    if comparison_table is not None:
        payload["comparison_table"] = json.dumps(comparison_table)
    return call_apps_script_post(payload)


