"use client";

import type { TableGridProps } from "./types";

export default function TableGrid({
  rows,
  editing,
  editValues,
  onUpdateValue,
}: TableGridProps) {
  return (
    <div
      className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
      onClick={(e) => e.stopPropagation()}
    >
      <table className="min-w-full text-left text-xs font-sans text-[var(--text-primary)]" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "15%" }} />
          <col style={{ width: "35%" }} />
          <col style={{ width: "35%" }} />
          <col style={{ width: "15%" }} />
        </colgroup>
        <thead>
          <tr className="border-b border-[var(--match-border)] font-bold text-[var(--match-text)] bg-[var(--table-header-bg)]">
            <th className="py-2.5 px-3 uppercase tracking-wider text-[10px] border-r border-[var(--border-visible)]">Field</th>
            <th className="py-2.5 px-3 uppercase tracking-wider text-[10px] border-r border-[var(--border-visible)]">Value in Evidence</th>
            <th className="py-2.5 px-3 uppercase tracking-wider text-[10px] border-r border-[var(--border-visible)]">Value in Ariba</th>
            <th className="py-2.5 px-3 uppercase tracking-wider text-[10px]">Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rIdx) => {
            const isMatch = row.result.toLowerCase() === "match";
            const isMismatch = row.result.toLowerCase() === "mismatch";

            return (
              <tr key={rIdx} className="hover:bg-[var(--bg-surface)] border-b border-[var(--border-subtle)]">
                <td className="py-2.5 px-3 text-[var(--text-primary)] font-medium border-r border-[var(--border-subtle)] whitespace-normal break-words align-top">
                  {row.field_name}
                </td>
                <td className="py-2.5 px-3 text-[var(--text-primary)] font-medium border-r border-[var(--border-subtle)] whitespace-normal break-words align-top">
                  {editing ? (
                    <textarea
                      value={editValues[rIdx] ?? row.value_evidence}
                      onChange={(e) => onUpdateValue(rIdx, e.target.value)}
                      aria-label={`${row.field_name} value in evidence`}
                      className="w-full bg-transparent border border-[var(--match-border)] rounded px-1.5 py-1 text-xs font-sans text-[var(--text-primary)] resize-none focus:outline-none focus:border-[var(--match-border)] transition-colors"
                      rows={2}
                    />
                  ) : (
                    <div className="whitespace-normal break-words">{row.value_evidence}</div>
                  )}
                </td>
                <td className="py-2.5 px-3 text-[var(--text-primary)] font-medium border-r border-[var(--border-subtle)] whitespace-normal break-words align-top">
                  {row.value_in_ariba}
                </td>
                <td className="py-2.5 px-3 text-[var(--text-primary)] font-medium whitespace-normal break-words align-top">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                      isMatch
                        ? "bg-[var(--match-bg)] text-[var(--match-text)]"
                        : isMismatch
                        ? "bg-[var(--mismatch-bg)] text-[var(--mismatch-text)]"
                        : "bg-[var(--accent-warning-soft)] text-[var(--accent-warning-text)]"
                    }`}
                  >
                    {row.result}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
