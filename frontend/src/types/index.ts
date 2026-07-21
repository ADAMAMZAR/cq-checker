export interface AuditLog {
  audit_id: string;
  supplier_id: number;
  timestamp: string;
  supplier_name: string;
  workspace_title: string;
  cert_type: string;
  complete_qa_data_dump: string;
  compiled_extracted_data: string;
  result: string;
  expiration_date: string;
  suggested_comment: string;
  comparison_table?: any;
  comparison_input_tokens?: number;
  comparison_output_tokens?: number;
  comparison_cost_usd?: number;
  comparison_cost_myr?: number;
  total_run_cost_usd?: number;
  total_run_cost_myr?: number;
}

export interface SupplierAssets {
  screenshots: string[];
  documents: { name: string; url: string }[];
}

export interface DocumentEvidence {
  audit_id: string;
  supplier_id: number;
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

export interface SupplierCost {
  name: string;
  count: number;
  cost: number;
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
