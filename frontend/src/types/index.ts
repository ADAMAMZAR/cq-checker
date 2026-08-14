export interface AuditLog {
  audit_id: string;
  supplier_id: number;
  created_at?: string;
  timestamp: string;
  supplier_name: string;
  workspace_title: string;
  cert_type?: string;
  complete_qa_data_dump: string;
  compiled_extracted_data: string;
  result: string;
  suggested_comment: string;
  comparison_table?: any;
  comparison_input_tokens?: number;
  comparison_output_tokens?: number;
  comparison_cost_usd?: number;
  comparison_cost_myr?: number;
  total_run_cost_usd?: number;
  total_run_cost_myr?: number;
}

export interface SupplierEntry {
  supplier_id: number;
  supplier_name: string;
  created_at?: string;
  date_added?: string;
  sm_vendor_id?: string;
}

export interface SupplierAssets {
  screenshots: string[];
  documents: { name: string; url: string }[];
}

export interface DocumentEvidence {
  id?: string;
  audit_id: string;
  supplier_id: number;
  created_at?: string;
  timestamp: string;
  supplier_name: string;
  filename: string;
  ariba_question_label: string;
  ariba_qa_answers: string;
  gemini_extracted_supplier_name: string;
  gemini_extracted_metadata: string;
  file_content_type: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  cost_myr: number;
  file_url?: string;
}

export interface DocumentEvidenceSummary {
  id: string;
  audit_id: string;
  supplier_id: number;
  supplier_name: string;
  filename: string;
  ariba_question_label: string;
  gemini_extracted_supplier_name: string;
  created_at?: string;
  timestamp: string;
}

export interface ComparisonTable {
  label: string;
  headers: string[];
  rows: string[][];
}

export interface FormFields {
  certificateOwnerName: string;
  issuerName: string;
  certificateType: string;
  certificateNumber: string;
  yearOfPublication: string;
  expirationDate: string;
  effectiveDate: string;
  certificateLocation: string;
}

export interface CostBreakdownItem {
  supplier_name: string;
  document_count: number;
  cost_usd?: number;
  cost_myr: number;
}

export interface ChatbotCostLog {
  id: string;
  query_text: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  cost_myr: number;
  cache_hit: boolean;
  latency_ms: number;
  cached_query_text?: string;
  created_at: string;
}

export interface IngestionCostDoc {
  id: string;
  title: string;
  file_url: string;
  page_count: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  cost_myr: number;
  created_at: string;
}

export interface CostAnalyticsData {
  master_cost_usd?: number;
  master_cost_myr?: number;
  total_cost_myr: number;
  total_documents: number;
  average_cost_myr: number;
  breakdown: CostBreakdownItem[];
  cq_checker?: {
    total_cost_usd: number;
    total_cost_myr: number;
    total_documents: number;
    average_cost_myr: number;
    breakdown: CostBreakdownItem[];
  };
  chatbot?: {
    total_cost_usd: number;
    total_cost_myr: number;
    total_queries: number;
    cache_hits: number;
    cache_hit_rate_pct: number;
    input_tokens: number;
    output_tokens: number;
    logs: ChatbotCostLog[];
  };
  ingestion?: {
    total_cost_usd: number;
    total_cost_myr: number;
    total_documents: number;
    total_pages: number;
    input_tokens: number;
    output_tokens: number;
    documents: IngestionCostDoc[];
  };
}

export interface AuditRegistryEntry {
  audit_id: string;
  supplier_id: number;
  supplier_name: string;
  result: string;
  created_at?: string;
  timestamp: string;
  cert_type?: string;
  document_count: number;
}

export interface AuditRegistryDetail extends AuditRegistryEntry {
  suggested_comment: string;
  screenshot_url?: string;
  comparison_table?: any;
}

export const FIELD_NAME_TO_META_KEY: Record<string, string> = {
  "Certificate Type": "certificateType",
  "Supplier Name": "certificateOwnerName",
  "Issuer": "issuerName",
  "Year of Publication": "yearOfPublication",
  "Certificate Number": "certificateNumber",
  "Certificate Location": "certificateLocation",
  "Effective Date": "effectiveDate",
  "Expiration Date": "expirationDate"
};

export const INITIAL_FORM_FIELDS: Record<string, string> = {
  certificateOwnerName: "",
  issuerName: "",
  certificateType: "",
  certificateNumber: "",
  yearOfPublication: "",
  expirationDate: "",
  effectiveDate: "",
  certificateLocation: ""
};

// ── RAG Chatbot ──────────────────────────────────────────────────────────────

export interface ChatSource {
  title: string;
  page_number?: number | null;
  snippet?: string | null;
  file_url?: string | null;
}

export interface ChatResponse {
  answer: string;
  sources: ChatSource[];
  cost_usd: number;
  cache_hit: boolean;
  session_id?: string | null;
  message_id?: string | null;
}

export interface ChatHistoryResponse {
  session_id: string;
  messages: { role: string; content: string; created_at?: string | null }[];
}

export interface ChatStreamDone {
  done: boolean;
  sources: ChatSource[];
  cost_usd: number;
  cache_hit: boolean;
  session_id?: string | null;
  message_id?: string | null;
  error?: string;
}

export type FeedbackRating = "satisfied" | "not_satisfied";

export interface FeedbackRequest {
  message_id: string;
  session_id: string;
  rating: FeedbackRating;
  reason?: string;
}

export interface FeedbackResponse {
  id: string;
  message_id: string;
  rating: FeedbackRating;
  reason?: string | null;
  created_at?: string | null;
}

// ── Document Ingestion ───────────────────────────────────────────────────────

export type IngestStatus = "created" | "skipped" | "failed";

export interface DocumentIngestResult {
  document_id?: string | null;
  title: string;
  status: IngestStatus;
  page_count?: number;
  parent_count?: number;
  child_count?: number;
  cost_usd: number;
  message: string;
}

export interface DocumentSummary {
  id: string;
  title: string;
  file_url: string;
  page_count?: number;
  parent_count?: number;
  child_count?: number;
  created_at?: string | null;
}

// ── Certificate Verification ─────────────────────────────────────────────────

export type CertificateStatus = "PASS" | "FAIL" | "REQUIRES_HUMAN_REVIEW";

export interface CertificateVerifyResult {
  status: CertificateStatus;
  extracted_data: Record<string, unknown>;
  reasoning_trace: string;
  confidence: number;
  rule_result?: Record<string, unknown> | null;
  record_id?: string | null;
}

export interface SupplierAuditResponse {
  id: string;
  file_url: string;
  extracted_data: Record<string, unknown>;
  status: CertificateStatus;
  reasoning_trace?: string | null;
  confidence?: number | null;
  created_at?: string | null;
}

// ── Database Browser (read-only preview) ─────────────────────────────────────

export interface DbTableMeta {
  name: string;
  row_count: number | null;
}

export interface DbTableData {
  table: string;
  columns: string[];
  rows: string[][];
  total: number;
  limit: number;
  offset: number;
  primary_keys?: string[];
}

// ── Schema Viewer (read-only ERD-style visualisation) ─────────────────────

export interface DbColumnMeta {
  name: string;
  type: string;            // raw Postgres UDT: "uuid", "varchar", "numeric", ...
  type_display: string;    // human-friendly: "UUID", "VARCHAR", "NUMERIC"
  nullable: boolean;
  default: string | null;
  is_primary_key: boolean;
  is_foreign_key: boolean;
  references: { table: string; column: string } | null;
}

export interface DbTableSchema {
  name: string;
  row_count: number | null;
  columns: DbColumnMeta[];
  primary_keys: string[];
  indexes: string[];
}

export interface DbRelationship {
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
  constraint: string;
}

export interface DbSchema {
  tables: DbTableSchema[];
  relationships: DbRelationship[];
}
