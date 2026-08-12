from pydantic import BaseModel, Field
from typing import Optional, List

class SupplierEntry(BaseModel):
    supplier_id: int = Field(..., description="Unique sequential integer ID of the supplier")
    supplier_name: str = Field(..., description="Cleaned supplier name")
    created_at: str = Field(default="", description="Timestamp of when the supplier was first audited")
    date_added: Optional[str] = Field(None, description="Legacy alias for created_at")
    sm_vendor_id: Optional[str] = Field(None, description="Ariba SM Vendor ID")

class DocumentEvidence(BaseModel):
    audit_id: str = Field(..., description="Unique UUID for the audit run")
    supplier_id: int = Field(..., description="Supplier ID referencing SupplierEntry")
    created_at: str = Field(default="", description="Timestamp of the document log")
    timestamp: Optional[str] = Field(default=None, description="Legacy alias for created_at")
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
    file_hash: Optional[str] = Field(None, description="SHA-256 hash of the document bytes")
    file_url: Optional[str] = Field(None, description="Supabase storage public file URL")

    def model_post_init(self, __context):
        if not self.created_at and self.timestamp:
            self.created_at = self.timestamp
        elif not self.timestamp and self.created_at:
            self.timestamp = self.created_at

class AuditLogEntry(BaseModel):
    audit_id: str = Field(..., description="Unique UUID for the audit run")
    supplier_id: int = Field(..., description="Supplier ID referencing SupplierEntry")
    created_at: str = Field(default="", description="Timestamp of the audit")
    timestamp: Optional[str] = Field(default=None, description="Legacy alias for created_at")
    supplier_name: str = Field(..., description="Supplier Name")
    workspace_title: Optional[str] = Field(default="Ariba Workspace", description="Workspace Title")
    cert_type: Optional[str] = Field(default="Relational evidence", description="Certificate Type")
    complete_qa_data_dump: Optional[str] = Field(default="[]", description="JSON string of all QA pairs scraped from the page")
    compiled_extracted_data: str = Field(..., description="JSON string of compiled metadata from all documents")
    result: Optional[str] = Field(default="Mismatch", description="Audit Result (Match/Mismatch)")
    suggested_comment: str = Field(..., description="Suggested feedback or comments")
    screenshot_url: Optional[str] = Field(None, description="Hosting path for verification screenshot")
    comparison_input_tokens: int = Field(default=0, description="Gemini prompt input tokens for comparison audit")
    comparison_output_tokens: int = Field(default=0, description="Gemini response output tokens for comparison audit")
    comparison_cost_usd: float = Field(default=0.0, description="Calculated USD cost of comparison audit call")
    total_run_cost_usd: float = Field(default=0.0, description="Combined USD cost of all files + comparison run")
    comparison_table: Optional[dict] = Field(default=None, description="Structured JSON comparison table data")

    def model_post_init(self, __context):
        if not self.created_at and self.timestamp:
            self.created_at = self.timestamp
        elif not self.timestamp and self.created_at:
            self.timestamp = self.created_at

class AuditResultResponse(BaseModel):
    audit_id: str
    supplier_id: int
    supplier_name: str
    workspace_title: Optional[str] = "Ariba Workspace"
    cert_type: Optional[str] = "Relational evidence"
    filename: str
    result: Optional[str] = "Mismatch"
    suggested_comment: str
    screenshot_url: Optional[str] = None
    comparison_input_tokens: int = 0
    comparison_output_tokens: int = 0
    comparison_cost_usd: float = 0.0
    total_run_cost_usd: float = 0.0
    comparison_table: Optional[dict] = None

class UpdateEvidenceRequest(BaseModel):
    audit_id: str = Field(..., description="Audit ID of the document to update")
    filename: str = Field(..., description="Filename of the document to update")
    updated_metadata: dict = Field(..., description="Full updated extracted certificate metadata dictionary")

class AuditRegistryEntry(BaseModel):
    audit_id: str
    supplier_id: int
    supplier_name: str
    result: str
    created_at: str = ""
    timestamp: Optional[str] = None
    cert_type: str = "Relational evidence"
    document_count: int = 0
    suggested_comment: str = ""
    screenshot_url: Optional[str] = None
    comparison_table: Optional[dict] = None

    def model_post_init(self, __context):
        if not self.created_at and self.timestamp:
            self.created_at = self.timestamp
        elif not self.timestamp and self.created_at:
            self.timestamp = self.created_at


class CertificateVerificationResponse(BaseModel):
    id: str
    file_url: str
    extracted_data: dict
    status: str
    reasoning_trace: Optional[str] = None
    confidence: Optional[float] = None
    created_at: Optional[str] = None


class CertificateVerifyResult(BaseModel):
    status: str
    extracted_data: dict
    reasoning_trace: str
    confidence: float
    rule_result: Optional[dict] = None
    record_id: Optional[str] = None


class DocumentIngestResult(BaseModel):
    document_id: Optional[str] = None
    title: str
    status: str
    page_count: int = 0
    parent_count: int = 0
    child_count: int = 0
    cost_usd: float = 0.0
    message: str = ""


class DocumentSummary(BaseModel):
    id: str
    title: str
    file_url: str
    page_count: int = 0
    parent_count: int = 0
    child_count: int = 0
    created_at: Optional[str] = None


class ChatRequest(BaseModel):
    query: str
    session_id: Optional[str] = None
    stream: bool = False


class ChatSource(BaseModel):
    title: str
    page_number: Optional[int] = None
    snippet: Optional[str] = None
    file_url: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    sources: List[ChatSource] = []
    cost_usd: float = 0.0
    cache_hit: bool = False
    session_id: Optional[str] = None
    message_id: Optional[str] = None


class ChatHistoryResponse(BaseModel):
    session_id: str
    messages: List[dict] = []


class FeedbackRequest(BaseModel):
    message_id: str
    session_id: str
    rating: str
    reason: Optional[str] = None


class FeedbackResponse(BaseModel):
    id: str
    message_id: str
    rating: str
    reason: Optional[str] = None
    created_at: Optional[str] = None

