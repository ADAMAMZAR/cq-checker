"use client";

import { memo } from "react";
import { IconLoader2, IconCheck, IconX, IconEdit } from "@tabler/icons-react";
import type { ColumnMeta, EditingCell, ExpandedCell } from "../types";

interface DataGridCellProps {
  cIdx: number;
  rIdx: number;
  cell: string;
  meta: ColumnMeta;
  offset: number;
  editingCell: EditingCell | null;
  editingValue: string;
  updatingCell: boolean;
  deletingRow: number | null;
  onSetEditingValue: (val: string) => void;
  onSetEditingCell: (cell: EditingCell | null) => void;
  onSaveCell: (rIdx: number, colName: string, val: string) => void;
  onPromptDeleteRow: (rIdx: number) => void;
  onSetExpandedCell: (cell: ExpandedCell | null) => void;
}

const DataGridCell = memo(function DataGridCell({
  cIdx,
  rIdx,
  cell,
  meta,
  offset,
  editingCell,
  editingValue,
  updatingCell,
  deletingRow,
  onSetEditingValue,
  onSetEditingCell,
  onSaveCell,
  onPromptDeleteRow,
  onSetExpandedCell,
}: DataGridCellProps) {
  const isEditingThisCell = editingCell?.rIdx === rIdx && editingCell?.colName === meta.name;

  if (isEditingThisCell) {
    return (
      <td key={cIdx} className="py-1 px-2 align-middle border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-1.5 min-w-[220px]">
          <input
            type="text"
            autoFocus
            value={editingValue}
            onChange={(e) => onSetEditingValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveCell(rIdx, meta.name, editingValue);
              if (e.key === "Escape") onSetEditingCell(null);
            }}
            className="flex-1 px-2.5 py-1 rounded bg-[var(--bg-input)] border border-[var(--accent-primary-border-focus)] text-xs font-medium text-[var(--heading-color)] focus:outline-none shadow-xs"
          />
          <button
            onClick={() => onSaveCell(rIdx, meta.name, editingValue)}
            disabled={updatingCell}
            className="p-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors cursor-pointer disabled:opacity-50"
            title="Save (Enter)"
          >
            {updatingCell ? (
              <IconLoader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <IconCheck className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={() => onPromptDeleteRow(rIdx)}
            disabled={deletingRow === rIdx}
            className="p-1.5 rounded text-[var(--text-tertiary)] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
            title="Delete row"
          >
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    );
  }

  return (
    <td
      key={cIdx}
      onDoubleClick={() => {
        if (meta.isEditable) {
          onSetEditingCell({ rIdx, colName: meta.name });
          onSetEditingValue(cell ?? "");
        } else {
          onSetExpandedCell({
            column: meta.name,
            rowNumber: offset + rIdx + 1,
            value: cell ?? "",
          });
        }
      }}
      title={
        meta.isEditable
          ? `Double-click or click edit icon to update ${meta.name}`
          : "Double-click for enlarged view"
      }
      className={`py-2 px-3 align-top group/cell ${meta.isLongText
          ? "whitespace-pre-wrap break-words max-w-[500px] leading-relaxed text-xs"
          : "whitespace-nowrap max-w-[260px] truncate text-xs"
        }`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className={meta.isTitleCol ? "font-semibold text-[var(--heading-color)]" : ""}>
          {cell === "" ? <span className="text-[var(--text-tertiary)]">NULL</span> : cell}
        </span>
        {meta.isEditable && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSetEditingCell({ rIdx, colName: meta.name });
              onSetEditingValue(cell ?? "");
            }}
            className="opacity-0 group-hover/cell:opacity-100 transition-opacity p-1 text-[var(--text-tertiary)] hover:text-[var(--accent-primary-text)] hover:bg-[var(--accent-primary-soft)] rounded cursor-pointer"
            title={`Edit ${meta.name}`}
          >
            <IconEdit className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </td>
  );
});

export default DataGridCell;
