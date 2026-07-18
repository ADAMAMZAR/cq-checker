import json
import logging
from datetime import datetime
from typing import List, Dict, Any
import gspread
from google.oauth2.service_account import Credentials
from app.config import settings
from app.schemas import AuditLogEntry

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
        # Return a standard service_account flow which might search default paths
        return gspread.service_account(filename=settings.google_creds_path)

def get_worksheet(client: gspread.Client) -> gspread.Worksheet:
    """
    Opens the Google Sheet database.
    If it doesn't exist, opens/creates standard headers in the first worksheet.
    """
    try:
        spreadsheet = client.open(settings.google_sheet_name)
        return spreadsheet.get_worksheet(0)
    except gspread.SpreadsheetNotFound:
        logger.error(f"Spreadsheet named '{settings.google_sheet_name}' not found. Please create it or share it with the service account.")
        raise

def append_audit_log(entry: AuditLogEntry) -> bool:
    """
    Appends an AuditLogEntry to the Google Sheet.
    Initializes standard headers if the sheet is completely empty.
    """
    try:
        client = get_sheets_client()
        sheet = get_worksheet(client)
        
        # Auto-initialize headers if the sheet is completely empty
        values = sheet.get_all_values()
        if not values or len(values) == 0:
            headers = [
                "Timestamp",
                "Supplier Name",
                "Workspace Title",
                "Certificate Type",
                "Filename",
                "Audit Result (Match/Mismatch)",
                "Expiration Date",
                "Suggested Comments"
            ]
            sheet.append_row(headers)
        
        # Append a new row containing the audit logs
        row = [
            entry.timestamp,
            entry.supplier_name,
            entry.workspace_title,
            entry.cert_type,
            entry.filename,
            entry.result,
            entry.expiration_date,
            entry.suggested_comment
        ]
        sheet.append_row(row)
        return True
    except Exception as e:
        logger.error(f"Failed to append row to Google Sheets: {e}")
        return False
 
def get_audit_logs() -> List[AuditLogEntry]:
    """
    Fetches all audit log entries from Google Sheets.
    """
    try:
        client = get_sheets_client()
        sheet = get_worksheet(client)
        
        # Safe check for empty sheet to prevent gspread errors
        values = sheet.get_all_values()
        if not values or len(values) <= 1:
            return []
            
        # Get all records (skipping header)
        records = sheet.get_all_records()
        logs = []
        for r in records:
            logs.append(AuditLogEntry(
                timestamp=str(r.get("Timestamp", "")),
                supplier_name=str(r.get("Supplier Name", "")),
                workspace_title=str(r.get("Workspace Title", "")),
                cert_type=str(r.get("Certificate Type", "")),
                filename=str(r.get("Filename", "")),
                result=str(r.get("Audit Result (Match/Mismatch)", "")),
                expiration_date=str(r.get("Expiration Date", "")),
                suggested_comment=str(r.get("Suggested Comments", ""))
            ))
        return logs
    except Exception as e:
        logger.error(f"Failed to fetch rows from Google Sheets: {e}")
        return []
