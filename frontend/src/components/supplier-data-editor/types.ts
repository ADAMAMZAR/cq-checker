import type { DocumentEvidence, DocumentEvidenceSummary } from "@/types";

export interface SupplierItem {
  supplier_id: number;
  supplier_name: string;
}

export interface SupplierDataEditorProps {
  onRefreshLogs?: () => void;
}

export interface SupplierPickerProps {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  isLoading: boolean;
  suppliers: SupplierItem[];
  onSelect: (supplier: SupplierItem) => void;
}

export interface SupplierFileListProps {
  supplier: SupplierItem;
  summaries: DocumentEvidenceSummary[];
  isLoading: boolean;
  onSelectFile: (summary: DocumentEvidenceSummary) => void;
  onBack: () => void;
}

export interface CertificateViewerProps {
  evidence: DocumentEvidence;
}

export interface EditFormFieldsProps {
  fields: Record<string, string>;
  onChange: (fields: Record<string, string>) => void;
}

export interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}
