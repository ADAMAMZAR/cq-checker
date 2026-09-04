import type { DbTableMeta, DbTableData } from "@/types";

export interface EditingCell {
  rIdx: number;
  colName: string;
}

export interface ExpandedCell {
  column: string;
  rowNumber: number;
  value: string;
}

export interface ConfirmDeleteState {
  rIdx: number;
  pk: Record<string, string>;
  tableName: string;
}

export interface ColumnMeta {
  name: string;
  normName: string;
  isTitleCol: boolean;
  isLongText: boolean;
  isEditable: boolean;
}

export interface TableListSidebarProps {
  tables: DbTableMeta[];
  tablesLoading: boolean;
  selectedTable: string | null;
  tableFilter: string;
  onTableFilterChange: (val: string) => void;
  onSelectTable: (table: string) => void;
}

export interface CellModalProps {
  column: string;
  rowNumber: number;
  value: string;
  onClose: () => void;
}

export interface ConfirmDeleteModalProps {
  confirmDeleteState: ConfirmDeleteState;
  deletingRow: number | null;
  onClose: () => void;
  onExecuteDelete: () => void;
}

export interface DataGridHeaderProps {
  selectedTable: string;
  data: DbTableData | null;
  dataLoading: boolean;
  rowSearch: string;
  page: number;
  totalPages: number;
  startRow: number;
  endRow: number;
  onRowSearchChange: (val: string) => void;
  onGoToPage: (page: number) => void;
}
