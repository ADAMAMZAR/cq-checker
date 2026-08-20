import type { AuditRegistryEntry, AuditRegistryDetail, DocumentEvidence, SupplierAssets, ComparisonTable } from "@/types";

export type StatusFilter = "ALL" | "MATCH" | "MISMATCH";
export type DetailTab = "comparison" | "assets";

export interface LogListPanelProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (status: StatusFilter) => void;
  isLoading: boolean;
  filteredLogs: AuditRegistryEntry[];
  selectedLog: AuditRegistryEntry | null;
  onSelectLog: (log: AuditRegistryEntry) => void;
}

export interface DetailPaneProps {
  log: AuditRegistryDetail;
  assets: SupplierAssets;
  assetsLoading: boolean;
  isEvidenceLoading: boolean;
  evidenceLogs: DocumentEvidence[];
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  onBack: () => void;
  copied: boolean;
  onCopyComment: (comment: string) => void;
  activeTableIdx: number | null;
  onTableToggle: (idx: number | null) => void;
  editingTableIdx: number | null;
  tableEditValues: Record<number, Record<number, string>>;
  onStartTableEdit: (idx: number) => void;
  onUpdateTableEditValue: (tIdx: number, rIdx: number, val: string) => void;
  onSaveTableEdits: (idx: number) => void;
  onCancelTableEdit: () => void;
  isSavingTableEdits: boolean;
  tableEditMsg: string | null;
  selectedScreenshot: string | null;
  onScreenshotClick: (url: string) => void;
}

export interface ComparisonTabProps {
  log: AuditRegistryDetail;
  assets: SupplierAssets;
  copied: boolean;
  onCopyComment: (comment: string) => void;
  activeTableIdx: number | null;
  onTableToggle: (idx: number | null) => void;
  editingTableIdx: number | null;
  tableEditValues: Record<number, Record<number, string>>;
  onStartTableEdit: (idx: number) => void;
  onUpdateTableEditValue: (tIdx: number, rIdx: number, val: string) => void;
  onSaveTableEdits: (idx: number) => void;
  onCancelTableEdit: () => void;
  isSavingTableEdits: boolean;
  tableEditMsg: string | null;
}

export interface EvidenceTabProps {
  log: AuditRegistryDetail;
  assets: SupplierAssets;
  assetsLoading: boolean;
  isEvidenceLoading: boolean;
  evidenceLogs: DocumentEvidence[];
  onScreenshotClick: (url: string) => void;
}

export interface ComparisonRowData {
  field_name: string;
  value_evidence: string;
  value_in_ariba: string;
  result: string;
}

export interface TableGridProps {
  rows: ComparisonRowData[];
  editing: boolean;
  editValues: Record<number, string>;
  onUpdateValue: (rIdx: number, val: string) => void;
}
