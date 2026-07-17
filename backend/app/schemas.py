from pydantic import BaseModel, Field
from typing import Optional, List

class AuditLogEntry(BaseModel):
    timestamp: str = Field(..., description="Timestamp of the audit")
    supplier_name: str = Field(..., description="Supplier Name")
    workspace_title: str = Field(..., description="Workspace Title")
    cert_type: str = Field(..., description="Certificate Type")
    filename: str = Field(..., description="Uploaded document filename")
    result: str = Field(..., description="Audit Result (Match/Mismatch)")
    expiration_date: str = Field(..., description="Expiration Date of the certificate")
    suggested_comment: str = Field(..., description="Suggested feedback or comments")

class AuditResultResponse(BaseModel):
    supplier_name: str
    workspace_title: str
    cert_type: str
    filename: str
    result: str  # Match/Mismatch
    expiration_date: str
    suggested_comment: str
    screenshot_url: Optional[str] = None
