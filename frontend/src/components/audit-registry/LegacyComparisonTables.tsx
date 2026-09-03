"use client";

import type { AuditRegistryDetail, ComparisonTable } from "@/types";

interface LegacyComparisonTablesProps {
  log: AuditRegistryDetail;
  table: { headers: string[]; rows: string[][] } | null;
  tables: ComparisonTable[];
}

export default function LegacyComparisonTables({ log, table, tables }: LegacyComparisonTablesProps) {
  return (
    <div className="p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] space-y-6">
      <div className="border-b border-[var(--border-subtle)] pb-3">
        <h3 className="text-sm font-bold text-[var(--heading-color)] tracking-wide">
          Supplier Name: <span className="text-[var(--match-text)]">{log.supplier_name}</span>
        </h3>
      </div>

      {table && (
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] hover:border-[var(--match-border)] transition-all duration-300 space-y-3 cursor-pointer">
          <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <table className="min-w-full text-left text-xs font-sans text-[var(--text-primary)]" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "15%" }} />
                <col style={{ width: "35%" }} />
                <col style={{ width: "35%" }} />
                <col style={{ width: "15%" }} />
              </colgroup>
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-card)]">
                  {table.headers.map((h, i) => (
                    <th key={i} className="p-3 text-[11px] font-bold text-[var(--heading-color)] tracking-wider uppercase">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {table.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-[var(--bg-surface-hover)] transition-colors">
                    {row.map((cell, cIdx) => {
                      const isStatusCell = cIdx === row.length - 1;
                      const cleanCell = cell.trim();
                      const isMatch = cleanCell.toLowerCase() === "match";
                      const isMismatch = cleanCell.toLowerCase() === "mismatch";

                      return (
                        <td
                          key={cIdx}
                          className={`py-2.5 px-3 text-[var(--text-primary)] font-medium whitespace-normal break-words align-top ${
                            cIdx < row.length - 1 ? "border-r border-[var(--border-subtle)]" : ""
                          }`}
                        >
                          {isStatusCell ? (
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                                isMatch
                                  ? "bg-[var(--match-bg)] text-[var(--match-text)]"
                                  : isMismatch
                                  ? "bg-[var(--mismatch-bg)] text-[var(--mismatch-text)]"
                                  : "bg-[var(--accent-warning-soft)] text-[var(--accent-warning-text)]"
                              }`}
                            >
                              {cleanCell}
                            </span>
                          ) : (
                            cleanCell
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tables.map((t, tIdx) => (
        <div
          key={tIdx}
          className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] hover:border-[var(--match-border)] transition-all duration-300 space-y-3 cursor-pointer"
        >
          {t.label && <h4 className="text-xs font-bold text-[var(--text-primary)] tracking-wide mt-2">{t.label}</h4>}
          <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <table className="min-w-full text-left text-xs font-sans text-[var(--text-primary)]" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "15%" }} />
                <col style={{ width: "35%" }} />
                <col style={{ width: "35%" }} />
                <col style={{ width: "15%" }} />
              </colgroup>
              <thead>
                <tr className="border-b border-[var(--match-border)] font-bold text-[var(--match-text)] bg-[var(--table-header-bg)]">
                  {t.headers.map((h, i) => (
                    <th
                      key={i}
                      className={`py-2.5 px-3 uppercase tracking-wider text-[10px] ${
                        i < t.headers.length - 1 ? "border-r border-[var(--border-visible)]" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-[var(--bg-surface)] border-b border-[var(--border-subtle)]">
                    {row.map((cell, cIdx) => {
                      const isStatusCell = cIdx === row.length - 1;
                      const cleanCell = cell.trim();
                      const isMatch = cleanCell.toLowerCase() === "match";
                      const isMismatch = cleanCell.toLowerCase() === "mismatch";

                      return (
                        <td
                          key={cIdx}
                          className={`py-2.5 px-3 text-[var(--text-primary)] font-medium whitespace-normal break-words align-top ${
                            cIdx < row.length - 1 ? "border-r border-[var(--border-subtle)]" : ""
                          }`}
                        >
                          {isStatusCell ? (
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                                isMatch
                                  ? "bg-[var(--match-bg)] text-[var(--match-text)]"
                                  : isMismatch
                                  ? "bg-[var(--mismatch-bg)] text-[var(--mismatch-text)]"
                                  : "bg-[var(--accent-warning-soft)] text-[var(--accent-warning-text)]"
                              }`}
                            >
                              {cleanCell}
                            </span>
                          ) : (
                            cleanCell
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
