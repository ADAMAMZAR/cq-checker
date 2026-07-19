from pydantic import BaseModel, Field
from typing import Optional, List

class SupplierEntry(BaseModel):
    supplier_id: int = Field(..., description="Unique sequential integer ID of the supplier")
    supplier_name: str = Field(..., description="Cleaned supplier name")
    date_added: str = Field(..., description="Timestamp of when the supplier was first audited")

class DocumentEvidence(BaseModel):
    audit_id: str = Field(..., description="Unique UUID for the audit run")
    supplier_id: int = Field(..., description="Supplier ID referencing SupplierEntry")
    timestamp: str = Field(..., description="Timestamp of the document log")
    supplier_name: str = Field(..., description="Cleaned supplier name")
    filename: str = Field(..., description="Filename of the downloaded document")
    ariba_question_label: str = Field(..., description="Label of the question where the file was attached")
    ariba_qa_answers: str = Field(..., description="JSON string of the answers under the question")
    gemini_extracted_supplier_name: str = Field(..., description="Supplier name extracted from document text by Gemini")
    gemini_extracted_metadata: str = Field(..., description="JSON string of all extracted document properties")
    file_content_type: str = Field(..., description="Content-Type/MIME-type of the file")
    input_tokens: int = Field(default=0, description="Gemini prompt input tokens")
    output_tokens: int = Field(default=0, description="Gemini response output tokens")
    cost_usd: float = Field(default=0.0, description="Calculated USD cost of the extraction call")
    cost_myr: float = Field(default=0.0, description="Calculated MYR cost of the extraction call")
    file_hash: Optional[str] = Field(None, description="SHA-256 hash of the document bytes")
    file_url: Optional[str] = Field(None, description="Supabase storage public file URL")

class AuditLogEntry(BaseModel):
    audit_id: str = Field(..., description="Unique UUID for the audit run")
    supplier_id: int = Field(..., description="Supplier ID referencing SupplierEntry")
    timestamp: str = Field(..., description="Timestamp of the audit")
    supplier_name: str = Field(..., description="Supplier Name")
    workspace_title: str = Field(..., description="Workspace Title")
    cert_type: str = Field(..., description="Certificate Type")
    complete_qa_data_dump: str = Field(..., description="JSON string of all QA pairs scraped from the page")
    compiled_extracted_data: str = Field(..., description="JSON string of compiled metadata from all documents")
    result: str = Field(..., description="Audit Result (Match/Mismatch)")
    expiration_date: str = Field(..., description="Expiration Date of the certificate")
    suggested_comment: str = Field(..., description="Suggested feedback or comments")
    screenshot_url: Optional[str] = Field(None, description="Hosting path for verification screenshot")
    comparison_input_tokens: int = Field(default=0, description="Gemini prompt input tokens for comparison audit")
    comparison_output_tokens: int = Field(default=0, description="Gemini response output tokens for comparison audit")
    comparison_cost_usd: float = Field(default=0.0, description="Calculated USD cost of comparison audit call")
    comparison_cost_myr: float = Field(default=0.0, description="Calculated MYR cost of comparison audit call")
    total_run_cost_usd: float = Field(default=0.0, description="Combined USD cost of all files + comparison run")
    total_run_cost_myr: float = Field(default=0.0, description="Combined MYR cost of all files + comparison run")

class AuditResultResponse(BaseModel):
    audit_id: str
    supplier_id: int
    supplier_name: str
    workspace_title: str
    cert_type: str
    filename: str
    result: str  # Match/Mismatch
    expiration_date: str
    suggested_comment: str
    screenshot_url: Optional[str] = None
    comparison_input_tokens: int = 0
    comparison_output_tokens: int = 0
    comparison_cost_usd: float = 0.0
    comparison_cost_myr: float = 0.0
    total_run_cost_usd: float = 0.0
    total_run_cost_myr: float = 0.0

class UpdateEvidenceRequest(BaseModel):
    audit_id: str = Field(..., description="Audit ID of the document to update")
    filename: str = Field(..., description="Filename of the document to update")
    updated_metadata: dict = Field(..., description="Full updated extracted certificate metadata dictionary")

