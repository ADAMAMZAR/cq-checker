"use client";

import { useMemo } from "react";
import { IconLoader2, IconTrash } from "@tabler/icons-react";
import type { DbTableData } from "@/types";
import type { ColumnMeta, EditingCell, ExpandedCell } from "../types";

import DataGridCell from "./DataGridCell";

interface DataGridTableProps {
  selectedTable: string;
  data: DbTableData;
  updatingCell: boolean;
  deletingRow: number | null;
  editingCell: EditingCell | null;
  editingValue: string;
  onSetEditingValue: (val: string) => void;
  onSetEditingCell: (cell: EditingCell | null) => void;
  onSaveCell: (rIdx: number, colName: string, val: string) => void;
  onPromptDeleteRow: (rIdx: number) => void;
  onSetExpandedCell: (cell: ExpandedCell | null) => void;
}

export default function DataGridTable({
  data,
  updatingCell,
  deletingRow,
  editingCell,
  editingValue,
  onSetEditingValue,
  onSetEditingCell,
  onSaveCell,
  onPromptDeleteRow,
  onSetExpandedCell,
}: DataGridTableProps) {
  // Pre-compute column metadata outside the 2,000-cell loop to eliminate render bottlenecks
  const columnsMeta: ColumnMeta[] = useMemo(() => {
    const pks = data.primary_keys ?? [];
    return data.columns.map((col) => {
      const normName = col.toLowerCase();
      const isTitleCol = normName === "title";
      const isLongText =
        normName.includes("content") ||
        normName.includes("text") ||
        normName.includes("snippet") ||
        normName.includes("answer") ||
        normName.includes("response");
      const isNonEditable =
        pks.includes(col) || ["created_at", "embedding", "tsv_content"].includes(normName);

      return {
        name: col,
        normName,
        isTitleCol,
        isLongText,
        isEditable: !isNonEditable,
      };
    });
  }, [data.columns, data.primary_keys]);

  return (
    <table className="w-full text-left text-xs font-sans text-[var(--text-primary)] border-collapse">
      <thead className="sticky top-0 z-10 bg-[var(--bg-card)]">
        <tr className="border-b border-[var(--border-subtle)]">
          <th className="py-2 px-3 tracking-wider text-[10px] text-[var(--text-tertiary)] font-bold w-10">
            #
          </th>
          {columnsMeta.map((meta) => (
            <th
              key={meta.name}
              className="py-2 px-3 tracking-wider text-[10px] text-[var(--text-tertiary)] font-bold whitespace-nowrap"
            >
              {meta.name}
            </th>
          ))}
          <th className="py-2 px-3 tracking-wider text-[10px] text-[var(--text-tertiary)] font-bold w-12">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {data.rows.map((row, rIdx) => {
          return (
            <tr
              key={rIdx}
              className="border-b border-[var(--border-subtle)] hover:bg-[var(--accent-primary-soft)] transition-colors"
            >
              <td className="py-1.5 px-3 font-mono text-[10px] text-[var(--text-tertiary)] whitespace-nowrap">
                {data.offset + rIdx + 1}
              </td>
              {row.map((cell, cIdx) => {
                const meta = columnsMeta[cIdx];
                if (!meta) return null;

                return (
                  <DataGridCell
                    key={cIdx}
                    cIdx={cIdx}
                    rIdx={rIdx}
                    cell={cell}
                    meta={meta}
                    offset={data.offset}
                    editingCell={editingCell}
                    editingValue={editingValue}
                    updatingCell={updatingCell}
                    deletingRow={deletingRow}
                    onSetEditingValue={onSetEditingValue}
                    onSetEditingCell={onSetEditingCell}
                    onSaveCell={onSaveCell}
                    onPromptDeleteRow={onPromptDeleteRow}
                    onSetExpandedCell={onSetExpandedCell}
                  />
                );
              })}
              <td className="py-1.5 px-3 text-center whitespace-nowrap">
                <button
                  onClick={() => onPromptDeleteRow(rIdx)}
                  disabled={deletingRow === rIdx}
                  title="Delete this row"
                  className="inline-flex items-center justify-center p-1.5 rounded-lg border border-transparent text-[var(--text-tertiary)] hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deletingRow === rIdx ? (
                    <IconLoader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <IconTrash className="w-3.5 h-3.5" />
                  )}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
