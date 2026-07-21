"use client";

import { useState } from "react";
import { IconRefresh, IconCircleCheck, IconAlertTriangle } from "@tabler/icons-react";

interface Row {
  field: string;
  evidence: string;
  qa: string;
}

const DEFAULT_FIELDS = [
  "Certificate Type",
  "Supplier Name",
  "Issuer",
  "Year of Publication",
  "Certificate Number",
  "Certificate Location",
  "Effective Date",
  "Expiration Date",
];

function clean(s: string): string {
  const v = String(s).trim().toLowerCase();
  if (["n/a", "na", "-", "missing", "none", "null"].includes(v)) return "";
  return v;
}

function matchKeyword(evidence: string, qa: string): "Match" | "Mismatch" {
  const ev = clean(evidence);
  const qaClean = clean(qa);

  if (!ev && !qaClean) return "Match";
  if (!ev || !qaClean) return "Mismatch";

  if (ev === qaClean || ev.includes(qaClean) || qaClean.includes(ev)) return "Match";

  const words = (s: string) =>
    s.replace(/[^\w\s]/g, "").split(" ").filter(w => w.length > 1);

  const evWords = words(ev);
  const qaWords = words(qaClean);

  if (evWords.length && evWords.every(w => qaClean.includes(w))) return "Match";
  if (qaWords.length && qaWords.every(w => ev.includes(w))) return "Match";

  return "Mismatch";
}

function normalizeDate(s: string): string {
  const str = String(s).trim();
  const patterns = [
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
  ];
  for (const p of patterns) {
    const m = str.match(p);
    if (m) {
      const [, a, b, c] = m;
      if (p === patterns[1] || p === patterns[2]) {
        return `${b}/${a}/${c}`;
      }
      return `${a}/${b}/${c}`;
    }
  }
  return str;
}

function computeResult(row: Row): "Match" | "Mismatch" {
  if (row.field === "Effective Date" || row.field === "Expiration Date") {
    return matchKeyword(normalizeDate(row.evidence), normalizeDate(row.qa));
  }
  return matchKeyword(row.evidence, row.qa);
}

const DEFAULT_ROWS: Row[] = DEFAULT_FIELDS.map(f => ({ field: f, evidence: "", qa: "" }));

export default function ComparisonPlayground() {
  const [rows, setRows] = useState<Row[]>(DEFAULT_ROWS);

  const updateRow = (idx: number, key: "evidence" | "qa", value: string) => {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
  };

  const resetAll = () => setRows(DEFAULT_ROWS.map(r => ({ ...r, evidence: "", qa: "" })));

  const matchCount = rows.filter(r => computeResult(r) === "Match").length;
  const totalCount = rows.length;

  return (
    <div className="flex-1 flex flex-col gap-6">
      {/* Header */}
      <div className="double-bezel">
        <div className="double-bezel-inner">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-[var(--heading-color)] tracking-tight">Comparison Playground</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Manually enter values in each column to test the matching logic. Results update in real time.
              </p>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider block">Match Rate</span>
                <span className={`text-lg font-black tabular-nums ${matchCount === totalCount ? "text-[var(--match-text)]" : "text-[var(--mismatch-text)]"}`}>
                  {matchCount}/{totalCount}
                </span>
              </div>
              <button
                onClick={resetAll}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-visible)] text-[var(--text-secondary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-surface-hover)] text-xs font-semibold transition-all cursor-pointer active:scale-95 shrink-0"
              >
                <IconRefresh className="h-4 w-4" />
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="double-bezel flex-1">
        <div className="double-bezel-inner h-full flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="min-w-full text-left text-xs font-sans">
              <colgroup>
                <col style={{ width: '18%' }} />
                <col style={{ width: '33%' }} />
                <col style={{ width: '33%' }} />
                <col style={{ width: '16%' }} />
              </colgroup>
              <thead>
                <tr className="border-b border-[var(--match-border)] font-bold text-[var(--match-text)] bg-[var(--table-header-bg)] backdrop-blur-sm">
                  <th className="py-3 px-4 uppercase tracking-wider text-[10px] border-r border-[var(--border-visible)]">Field</th>
                  <th className="py-3 px-4 uppercase tracking-wider text-[10px] border-r border-[var(--border-visible)]">Value in Evidence</th>
                  <th className="py-3 px-4 uppercase tracking-wider text-[10px] border-r border-[var(--border-visible)]">Value in Ariba</th>
                  <th className="py-3 px-4 uppercase tracking-wider text-[10px]">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {rows.map((row, idx) => {
                  const result = computeResult(row);
                  const isMatch = result === "Match";
                  return (
                    <tr key={row.field} className="hover:bg-[var(--bg-surface)] transition-colors duration-150">
                      <td className="py-3 px-4 text-[var(--heading-color)] font-semibold border-r border-[var(--border-subtle)] align-top">
                        {row.field}
                      </td>
                      <td className="py-3 px-4 border-r border-[var(--border-subtle)] align-top">
                        <textarea
                          value={row.evidence}
                          onChange={e => updateRow(idx, "evidence", e.target.value)}
                          placeholder="Enter value from certificate..."
                          rows={2}
                          className="w-full bg-transparent border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs font-sans text-[var(--text-primary)] placeholder-[var(--text-muted)] resize-none focus:outline-none focus:border-[var(--match-border)] hover:border-[var(--border-visible)] transition-colors"
                        />
                      </td>
                      <td className="py-3 px-4 border-r border-[var(--border-subtle)] align-top">
                        <textarea
                          value={row.qa}
                          onChange={e => updateRow(idx, "qa", e.target.value)}
                          placeholder="Enter value from questionnaire..."
                          rows={2}
                          className="w-full bg-transparent border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs font-sans text-[var(--text-primary)] placeholder-[var(--text-muted)] resize-none focus:outline-none focus:border-[var(--match-border)] hover:border-[var(--border-visible)] transition-colors"
                        />
                      </td>
                      <td className="py-3 px-4 align-top">
                        {row.evidence || row.qa ? (
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${isMatch
                              ? "bg-[var(--match-bg)] text-[var(--match-text)] border-[var(--match-border)]"
                              : "bg-[var(--mismatch-bg)] text-[var(--mismatch-text)] border-[var(--mismatch-border)]"
                            }`}>
                            {isMatch ? <IconCircleCheck className="h-3 w-3" /> : <IconAlertTriangle className="h-3 w-3" />}
                            {result}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)] text-[10px] italic">Awaiting input</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
