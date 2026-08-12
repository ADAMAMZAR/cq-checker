"use client";

import { useState, useEffect, useMemo } from "react";
import {
  IconSearch,
  IconPlus,
  IconTrash,
  IconRefresh,
  IconCheck,
  IconX,
  IconAlertTriangle,
  IconCopy,
  IconDownload,
  IconTable,
  IconArrowUpRight,
  IconFilter,
  IconInfoCircle,
  IconFileSpreadsheet,
  IconExternalLink,
} from "@tabler/icons-react";

export type VerdictType = "Match" | "Mismatch" | "Requires Human Review";

export interface MatrixRow {
  id: string;
  userInput: string;
  evidence: string;
  verdict: VerdictType;
  note: string;
  isCustom?: boolean;
}

export interface MatrixCategory {
  id: string;
  title: string;
  icon: string;
  description: string;
  rows: MatrixRow[];
}

const DEFAULT_CATEGORIES: MatrixCategory[] = [
  {
    id: "supplier-name",
    title: "Supplier Name",
    icon: "🏢",
    description: "Evaluates exact match, legal entity suffixes, punctuation invariance, and substring token inclusion.",
    rows: [
      {
        id: "sn-1",
        userInput: "Acme Corporation Sdn Bhd",
        evidence: "Acme Corporation Sdn Bhd",
        verdict: "Match",
        note: "Exact string equality",
      },
      {
        id: "sn-2",
        userInput: "ACME CORPORATION SDN. BHD.",
        evidence: "Acme Corporation Sdn Bhd",
        verdict: "Match",
        note: "Case & punctuation insensitive match",
      },
      {
        id: "sn-3",
        userInput: "Acme Corp",
        evidence: "Acme Corporation Pty Ltd",
        verdict: "Match",
        note: "Legal suffix variation & root token match",
      },
      {
        id: "sn-4",
        userInput: "Acme Logistics",
        evidence: "Acme Logistics & Distribution Services",
        verdict: "Match",
        note: "Token word inclusion match",
      },
      {
        id: "sn-5",
        userInput: "Acme Industrial",
        evidence: "Acme Industries",
        verdict: "Mismatch",
        note: "Name typo / distinct business entity",
      },
      {
        id: "sn-6",
        userInput: "Beta Global Ltd",
        evidence: "Acme Corporation",
        verdict: "Mismatch",
        note: "Completely different company name",
      },
      {
        id: "sn-7",
        userInput: "Acme Corporation",
        evidence: "N/A",
        verdict: "Mismatch",
        note: "Missing supplier name on evidence",
      },
    ],
  },
  {
    id: "policy-number",
    title: "Certificate / Policy Number",
    icon: "🔢",
    description: "Handles slash vs hyphen delimiters, missing prefixes, special characters, and OCR artifacts.",
    rows: [
      {
        id: "pn-1",
        userInput: "POL-2024-9981",
        evidence: "POL-2024-9981",
        verdict: "Match",
        note: "Exact policy match",
      },
      {
        id: "pn-2",
        userInput: "POL/2024/9981",
        evidence: "POL-2024-9981",
        verdict: "Match",
        note: "Delimiter normalization (/ -> -)",
      },
      {
        id: "pn-3",
        userInput: "POL 2024 9981",
        evidence: "POL-2024-9981",
        verdict: "Match",
        note: "Whitespace invariant match",
      },
      {
        id: "pn-4",
        userInput: "2024-9981",
        evidence: "POL-2024-9981",
        verdict: "Match",
        note: "Core numeric sequence substring match",
      },
      {
        id: "pn-5",
        userInput: "POL-2024-9982",
        evidence: "POL-2024-9981",
        verdict: "Mismatch",
        note: "Single digit discrepancy (2 vs 1)",
      },
      {
        id: "pn-6",
        userInput: "POL20249981",
        evidence: "POL-2024-9981",
        verdict: "Match",
        note: "Cleaned alphanumeric string match",
      },
      {
        id: "pn-7",
        userInput: "POL-2024-9981¹",
        evidence: "POL-2024-9981",
        verdict: "Match",
        note: "OCR superscript artifact (¹) stripped",
      },
      {
        id: "pn-8",
        userInput: "POL-2024-9981",
        evidence: "N/A",
        verdict: "Mismatch",
        note: "Policy number missing on certificate",
      },
      {
        id: "pn-9",
        userInput: "POL-A100",
        evidence: "POL-A100, POL-B200",
        verdict: "Match",
        note: "Matched in multi-policy merged document",
      },
    ],
  },
  {
    id: "expiration-date",
    title: "Expiration Date & Validity Cap Rules",
    icon: "📅",
    description: "Enforces date format normalization, expiry checks, regional 10-yr (MY) / 3-yr (AU) caps, and permanent flags.",
    rows: [
      {
        id: "ed-1",
        userInput: "31/12/2027",
        evidence: "31/12/2027",
        verdict: "Match",
        note: "Current valid expiration date",
      },
      {
        id: "ed-2",
        userInput: "2027-12-31",
        evidence: "31/12/2027",
        verdict: "Match",
        note: "Date format normalized to DD/MM/YYYY",
      },
      {
        id: "ed-3",
        userInput: "31/12/2026",
        evidence: "15/01/2023",
        verdict: "Mismatch",
        note: "Certificate expired on 15/01/2023",
      },
      {
        id: "ed-4",
        userInput: "31/12/2028",
        evidence: "Eff: 01/01/2012, Exp: 31/12/2028",
        verdict: "Mismatch",
        note: "Exceeds 10-year validity cap for Malaysia",
      },
      {
        id: "ed-5",
        userInput: "31/12/2025",
        evidence: "Eff: 01/01/2020, Exp: 31/12/2025",
        verdict: "Mismatch",
        note: "Exceeds 3-year validity cap for Australia",
      },
      {
        id: "ed-6",
        userInput: "Permanent",
        evidence: "KEKAL SAH",
        verdict: "Match",
        note: "Permanent / non-expiring flag set",
      },
      {
        id: "ed-7",
        userInput: "31/12/2027",
        evidence: "Recertification Pending",
        verdict: "Requires Human Review",
        note: "Recertification letter intercept",
      },
      {
        id: "ed-8",
        userInput: "31/12/2027",
        evidence: "N/A",
        verdict: "Mismatch",
        note: "Missing expiration date on document",
      },
    ],
  },
  {
    id: "issuer-name",
    title: "Issuer Name",
    icon: "🏛️",
    description: "Validates issuing authorities, statutory abbreviations (e.g. SSM, MOF), and government bodies.",
    rows: [
      {
        id: "in-1",
        userInput: "Suruhanjaya Syarikat Malaysia",
        evidence: "Suruhanjaya Syarikat Malaysia",
        verdict: "Match",
        note: "Exact issuer match",
      },
      {
        id: "in-2",
        userInput: "Suruhanjaya Syarikat Malaysia (SSM)",
        evidence: "SSM",
        verdict: "Match",
        note: "Known authority abbreviation",
      },
      {
        id: "in-3",
        userInput: "Ministry of Finance",
        evidence: "Ministry of Finance Malaysia (MOF)",
        verdict: "Match",
        note: "Government body title match",
      },
      {
        id: "in-4",
        userInput: "WorkSafe QLD",
        evidence: "ISO Registrar QMS Ltd",
        verdict: "Mismatch",
        note: "Mismatched issuing authority",
      },
      {
        id: "in-5",
        userInput: "City Council",
        evidence: "Local Authority",
        verdict: "Mismatch",
        note: "Generic / unverified issuer title",
      },
      {
        id: "in-6",
        userInput: "WorkSafe VIC",
        evidence: "N/A",
        verdict: "Mismatch",
        note: "Issuer missing from document",
      },
    ],
  },
  {
    id: "cert-type",
    title: "Certificate Type & Category",
    icon: "📋",
    description: "Checks insurance types, ISO standards, regional state intercepts (QLD/NSW), and document notices.",
    rows: [
      {
        id: "ct-1",
        userInput: "Workers' Compensation Insurance",
        evidence: "Workers' Compensation (QLD)",
        verdict: "Match",
        note: "Valid category match",
      },
      {
        id: "ct-2",
        userInput: "ISO 9001:2015 Quality",
        evidence: "ISO 14001:2015 Environmental",
        verdict: "Mismatch",
        note: "Wrong ISO Standard category",
      },
      {
        id: "ct-3",
        userInput: "Workers' Compensation (QLD)",
        evidence: "Workers' Compensation (NSW)",
        verdict: "Mismatch",
        note: "State jurisdiction mismatch",
      },
      {
        id: "ct-4",
        userInput: "Public Liability 20M",
        evidence: "Product Liability 10M",
        verdict: "Mismatch",
        note: "Wrong insurance policy type",
      },
      {
        id: "ct-5",
        userInput: "Full Certificate",
        evidence: "Recertification Confirmation Letter",
        verdict: "Requires Human Review",
        note: "Document type notice",
      },
      {
        id: "ct-6",
        userInput: "SSM Form 9",
        evidence: "General Upload Attachment",
        verdict: "Match",
        note: "General attachment fallback",
      },
      {
        id: "ct-7",
        userInput: "Public Liability",
        evidence: "Public Liability & Prof. Indemnity",
        verdict: "Match",
        note: "Merged multi-certificate match",
      },
    ],
  },
  {
    id: "liability-amount",
    title: "Public Liability & Coverage Amount",
    icon: "💰",
    description: "Parses currency symbols, million shorthand ($20M), minimum required coverage limits, and AUD defaults.",
    rows: [
      {
        id: "la-1",
        userInput: "$20M AUD",
        evidence: "AUD $20,000,000",
        verdict: "Match",
        note: "Exact amount & currency match",
      },
      {
        id: "la-2",
        userInput: "$20,000,000",
        evidence: "$20M",
        verdict: "Match",
        note: "Numeric shorthand $20M normalized",
      },
      {
        id: "la-3",
        userInput: "$10,000,000 AUD",
        evidence: "$10,000,000",
        verdict: "Match",
        note: "Currency symbol $ defaulted to AUD",
      },
      {
        id: "la-4",
        userInput: "$10,000,000",
        evidence: "$5,000,000",
        verdict: "Mismatch",
        note: "Insufficient limit: $5M < $10M required",
      },
      {
        id: "la-5",
        userInput: "$20,000,000",
        evidence: "20,000,000",
        verdict: "Match",
        note: "Inferred currency & numeric match",
      },
      {
        id: "la-6",
        userInput: "$10,000,000",
        evidence: "N/A",
        verdict: "Mismatch",
        note: "Coverage amount missing",
      },
    ],
  },
  {
    id: "cert-location",
    title: "Certificate Location",
    icon: "📍",
    description: "Normalizes state and country names, territories, and geographical abbreviations.",
    rows: [
      {
        id: "cl-1",
        userInput: "Selangor, Malaysia",
        evidence: "Selangor, Malaysia",
        verdict: "Match",
        note: "State & Country match",
      },
      {
        id: "cl-2",
        userInput: "Kuala Lumpur, Malaysia",
        evidence: "Malaysia",
        verdict: "Match",
        note: "Country token match",
      },
      {
        id: "cl-3",
        userInput: "Queensland, Australia",
        evidence: "Victoria, Australia",
        verdict: "Mismatch",
        note: "Mismatched territory state",
      },
      {
        id: "cl-4",
        userInput: "New South Wales, Australia",
        evidence: "NSW, Australia",
        verdict: "Match",
        note: "State abbreviation expanded",
      },
      {
        id: "cl-5",
        userInput: "Western Australia",
        evidence: "N/A",
        verdict: "Mismatch",
        note: "Location missing from certificate",
      },
    ],
  },
];

const LOCAL_STORAGE_KEY = "cq_matrix_cases_v2";

export default function ComparisonMatrix() {
  const [categories, setCategories] = useState<MatrixCategory[]>(DEFAULT_CATEGORIES);
  const [searchQuery, setSearchQuery] = useState("");
  const [verdictFilter, setVerdictFilter] = useState<string>("ALL");
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);

  // Load saved state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCategories(parsed);
        }
      }
    } catch (e) {
      console.error("Failed to load matrix cases from local storage:", e);
    }
  }, []);

  // Save changes to localStorage
  const saveCategories = (updated: MatrixCategory[]) => {
    setCategories(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save matrix cases to local storage:", e);
    }
  };

  // Reset to default cases
  const handleResetDefaults = () => {
    if (confirm("Reset all test cases back to original system defaults? Custom rows will be cleared.")) {
      saveCategories(DEFAULT_CATEGORIES);
    }
  };

  // Update specific row cell
  const handleCellChange = (catId: string, rowId: string, field: keyof MatrixRow, value: string) => {
    const updated = categories.map((cat) => {
      if (cat.id !== catId) return cat;
      return {
        ...cat,
        rows: cat.rows.map((row) => {
          if (row.id !== rowId) return row;
          return { ...row, [field]: value };
        }),
      };
    });
    saveCategories(updated);
  };

  // Add a new row to a category
  const handleAddRow = (catId: string) => {
    const newId = `custom-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const newRow: MatrixRow = {
      id: newId,
      userInput: "Sample Input Value",
      evidence: "Sample Evidence Value",
      verdict: "Match",
      note: "Custom user-added comparison rule test case",
      isCustom: true,
    };

    const updated = categories.map((cat) => {
      if (cat.id !== catId) return cat;
      return { ...cat, rows: [...cat.rows, newRow] };
    });
    saveCategories(updated);
  };

  // Delete a row
  const handleDeleteRow = (catId: string, rowId: string) => {
    const updated = categories.map((cat) => {
      if (cat.id !== catId) return cat;
      return {
        ...cat,
        rows: cat.rows.filter((r) => r.id !== rowId),
      };
    });
    saveCategories(updated);
  };

  // Export matrix to JSON
  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(categories, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `certificate_comparison_matrix_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Export matrix to CSV for Google Sheets / Excel
  const handleExportCSV = () => {
    const escapeCSV = (str: string) => {
      if (str.includes('"') || str.includes(",") || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    let csvContent = "\uFEFF"; // UTF-8 BOM for Excel/GSheets compatibility
    csvContent += "Category,User Input (Ariba QA),Evidence (Extracted Value),Verdict / Result,Rule Note / Explanation\n";

    filteredCategories.forEach((cat) => {
      cat.rows.forEach((row) => {
        const catName = escapeCSV(cat.title);
        const input = escapeCSV(row.userInput);
        const ev = escapeCSV(row.evidence);
        const verdict = escapeCSV(row.verdict);
        const note = escapeCSV(row.note);
        csvContent += `${catName},${input},${ev},${verdict},${note}\n`;
      });
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", url);
    downloadAnchor.setAttribute("download", `certificate_comparison_matrix_gsheet_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    setCopiedNotification("CSV downloaded! Import directly into Google Sheets.");
    setTimeout(() => setCopiedNotification(null), 3000);
  };

  // Copy TSV (Tab-Separated Values) to clipboard for direct Ctrl+V paste into Google Sheets
  const handleCopyTSV = () => {
    let tsv = "Category\tUser Input (Ariba QA)\tEvidence (Extracted Value)\tVerdict / Result\tRule Note / Explanation\n";

    filteredCategories.forEach((cat) => {
      cat.rows.forEach((row) => {
        const catName = cat.title.replace(/[\t\n]/g, " ");
        const input = row.userInput.replace(/[\t\n]/g, " ");
        const ev = row.evidence.replace(/[\t\n]/g, " ");
        const verdict = row.verdict;
        const note = row.note.replace(/[\t\n]/g, " ");
        tsv += `${catName}\t${input}\t${ev}\t${verdict}\t${note}\n`;
      });
    });

    navigator.clipboard.writeText(tsv);
    setCopiedNotification("Copied TSV to clipboard! Open Google Sheets and press Ctrl+V to paste.");
    setTimeout(() => setCopiedNotification(null), 3500);
  };

  // Copy Markdown Table to Clipboard
  const handleCopyMarkdown = () => {
    let md = "# Certificate Audit Comparison Matrix & Edge Cases\n\n";

    filteredCategories.forEach((cat) => {
      md += `## ${cat.icon} ${cat.title}\n\n`;
      md += `| User Input (Ariba QA) | Evidence (Extracted Value) | Result & Rule Explanation |\n`;
      md += `| :--- | :--- | :--- |\n`;

      cat.rows.forEach((row) => {
        const icon = row.verdict === "Match" ? "🟢 Match" : row.verdict === "Mismatch" ? "🔴 Mismatch" : "🟠 Review";
        md += `| \`${row.userInput}\` | \`${row.evidence}\` | **${icon}** - ${row.note} |\n`;
      });

      md += `\n`;
    });

    navigator.clipboard.writeText(md);
    setCopiedNotification("Copied Markdown to clipboard!");
    setTimeout(() => setCopiedNotification(null), 3000);
  };

  // Filtered categories and rows
  const filteredCategories = useMemo(() => {
    return categories
      .map((cat) => {
        const filteredRows = cat.rows.filter((row) => {
          // Verdict filter
          if (verdictFilter !== "ALL" && row.verdict !== verdictFilter) {
            return false;
          }

          // Search query filter
          if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            return (
              row.userInput.toLowerCase().includes(q) ||
              row.evidence.toLowerCase().includes(q) ||
              row.note.toLowerCase().includes(q) ||
              cat.title.toLowerCase().includes(q)
            );
          }

          return true;
        });

        return { ...cat, rows: filteredRows };
      })
      .filter((cat) => cat.rows.length > 0 || !searchQuery);
  }, [categories, searchQuery, verdictFilter]);

  // Aggregate stats
  const totalRowsCount = useMemo(() => {
    return categories.reduce((sum, c) => sum + c.rows.length, 0);
  }, [categories]);

  const matchCount = useMemo(() => {
    return categories.reduce((sum, c) => sum + c.rows.filter((r) => r.verdict === "Match").length, 0);
  }, [categories]);

  const mismatchCount = useMemo(() => {
    return categories.reduce((sum, c) => sum + c.rows.filter((r) => r.verdict === "Mismatch").length, 0);
  }, [categories]);

  const reviewCount = useMemo(() => {
    return categories.reduce((sum, c) => sum + c.rows.filter((r) => r.verdict === "Requires Human Review").length, 0);
  }, [categories]);

  return (
    <div className="flex-1 flex flex-col gap-8 w-full max-w-7xl mx-auto py-6 animate-fade-in">
      {/* ── Page Header Banner ── */}
      <div className="relative rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-[var(--border-visible)] p-6 sm:p-8 shadow-2xl overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none text-blue-400">
          <IconTable className="w-64 h-64" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex flex-col gap-2 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-semibold w-max border border-blue-500/30">
              <IconInfoCircle className="w-3.5 h-3.5" />
              <span>Interactive Rule Matrix & Test Case Sandbox</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Certificate Audit Comparison Matrix
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Complete reference matrix for all extracted certificate fields. Click on any cell in the 3 columns below to edit inputs, change verdicts, or add custom test cases.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 font-bold text-xs border border-emerald-500/40 transition-all shadow-sm active:scale-95 cursor-pointer"
              title="Download UTF-8 CSV file ready for Google Sheets or Excel import"
            >
              <IconFileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Export CSV (for GSheets)</span>
            </button>

            <button
              onClick={handleCopyTSV}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 font-bold text-xs border border-teal-500/40 transition-all shadow-sm active:scale-95 cursor-pointer"
              title="Copy tab-separated values to clipboard. Paste directly into Google Sheets with Ctrl+V"
            >
              <IconCopy className="w-4 h-4 text-teal-400" />
              <span>Copy for GSheets (Ctrl+V)</span>
            </button>

            <a
              href="https://sheets.new"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs border border-slate-700 transition-all shadow-sm active:scale-95 cursor-pointer no-underline"
              title="Open a blank Google Sheet in a new tab"
            >
              <span>Open sheets.new</span>
              <IconExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </a>

            <button
              onClick={handleCopyMarkdown}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs border border-slate-700 transition-all shadow-sm active:scale-95 cursor-pointer"
              title="Copy Markdown representation to clipboard"
            >
              <IconCopy className="w-4 h-4 text-blue-400" />
              <span>Copy Markdown</span>
            </button>

            <button
              onClick={handleExportJSON}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs border border-slate-700 transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <IconDownload className="w-4 h-4 text-slate-400" />
              <span>JSON</span>
            </button>

            <button
              onClick={handleResetDefaults}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-medium text-xs border border-rose-500/30 transition-all active:scale-95 cursor-pointer"
            >
              <IconRefresh className="w-4 h-4" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Notification Toast */}
        {copiedNotification && (
          <div className="relative z-10 mt-4 px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs font-semibold flex items-center justify-between animate-fade-in shadow-md">
            <div className="flex items-center gap-2">
              <IconCheck className="w-4 h-4 text-emerald-400" />
              <span>{copiedNotification}</span>
            </div>
            <button onClick={() => setCopiedNotification(null)} className="text-emerald-300 hover:text-white">
              <IconX className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ── Summary Stats Pills ── */}
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-sm">
              {totalRowsCount}
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-slate-400 font-medium">Total Cases</span>
              <span className="text-xs text-slate-200 font-bold">{categories.length} Categories</span>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-sm">
              {matchCount}
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-emerald-300/80 font-medium">Match Cases</span>
              <span className="text-xs text-emerald-300 font-bold">🟢 High Confidence</span>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center text-rose-400 font-bold text-sm">
              {mismatchCount}
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-rose-300/80 font-medium">Mismatch Cases</span>
              <span className="text-xs text-rose-300 font-bold">🔴 Rule Violations</span>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-sm">
              {reviewCount}
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-amber-300/80 font-medium">Review Flagged</span>
              <span className="text-xs text-amber-300 font-bold">🟠 Manual Review</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Controls & Category Nav Jump Bar ── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-[var(--bg-card)] border border-[var(--border-visible)] p-4 rounded-xl shadow-sm">
        {/* Search Bar */}
        <div className="relative flex-1">
          <IconSearch className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search test cases by User Input, Evidence, or Rule Notes..."
            className="w-full pl-10 pr-4 py-2 text-xs rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--accent-primary-border)] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <IconX className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Verdict Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto bg-[var(--bg-input)] p-1 rounded-lg border border-[var(--border-subtle)]">
          {[
            { id: "ALL", label: "All Cases" },
            { id: "Match", label: "🟢 Matches" },
            { id: "Mismatch", label: "🔴 Mismatches" },
            { id: "Requires Human Review", label: "🟠 Review" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setVerdictFilter(item.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer whitespace-nowrap ${
                verdictFilter === item.id
                  ? "bg-[var(--accent-primary)] text-white shadow-sm font-semibold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category Anchor Jumps */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
        {categories.map((cat) => (
          <a
            key={cat.id}
            href={`#${cat.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--accent-primary-soft)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary-border)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent-primary-text)] transition-all whitespace-nowrap"
          >
            <span>{cat.icon}</span>
            <span>{cat.title}</span>
            <span className="px-1.5 py-0.5 rounded-full bg-[var(--bg-input)] text-[10px] font-bold">
              {cat.rows.length}
            </span>
          </a>
        ))}
      </div>

      {/* ── Category Tables ── */}
      <div className="flex flex-col gap-10">
        {filteredCategories.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 rounded-xl bg-[var(--bg-card)] border border-[var(--border-visible)] text-center">
            <IconAlertTriangle className="w-12 h-12 text-amber-400 mb-3" />
            <h3 className="text-base font-bold text-[var(--heading-color)]">No matching test cases found</h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mt-1">
              Try adjusting your search query or switching the verdict filter tab.
            </p>
          </div>
        ) : (
          filteredCategories.map((cat) => (
            <section
              key={cat.id}
              id={cat.id}
              className="flex flex-col gap-4 bg-[var(--bg-card)] border border-[var(--border-visible)] rounded-2xl p-5 sm:p-6 shadow-md transition-all hover:border-[var(--border-visible-strong)]"
            >
              {/* Category Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--accent-primary-soft)] border border-[var(--accent-primary-border)] flex items-center justify-center text-xl shrink-0 shadow-sm">
                    {cat.icon}
                  </div>
                  <div className="flex flex-col">
                    <h2 className="text-lg font-bold text-[var(--heading-color)] flex items-center gap-2">
                      <span>{cat.title}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] font-semibold border border-[var(--accent-primary-border)]">
                        {cat.rows.length} cases
                      </span>
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">{cat.description}</p>
                  </div>
                </div>

                {/* Add Case Button */}
                <button
                  onClick={() => handleAddRow(cat.id)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white font-bold text-xs transition-all shadow-md active:scale-95 cursor-pointer shrink-0 self-start sm:self-auto"
                >
                  <IconPlus className="w-4 h-4" />
                  <span>Add Case</span>
                </button>
              </div>

              {/* 3-Column Table */}
              <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[var(--bg-header)] text-[var(--text-secondary)] font-semibold border-b border-[var(--border-subtle)]">
                      <th className="py-3 px-4 w-1/3 min-w-[220px]">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                          <span>User Input (Ariba QA)</span>
                        </div>
                      </th>
                      <th className="py-3 px-4 w-1/3 min-w-[220px]">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                          <span>Evidence (Extracted Value)</span>
                        </div>
                      </th>
                      <th className="py-3 px-4 w-1/3 min-w-[300px]">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                          <span>Result & Rule Note</span>
                        </div>
                      </th>
                      <th className="py-3 px-2 w-12 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {cat.rows.map((row, idx) => (
                      <tr
                        key={row.id}
                        className={`group hover:bg-[var(--bg-hover)] transition-colors ${
                          row.isCustom ? "bg-blue-500/5" : ""
                        }`}
                      >
                        {/* Column 1: User Input */}
                        <td className="p-3 align-top">
                          <input
                            type="text"
                            value={row.userInput}
                            onChange={(e) => handleCellChange(cat.id, row.id, "userInput", e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs rounded-md bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-subtle)] focus:border-[var(--accent-primary-border)] focus:outline-none transition-colors font-mono"
                          />
                        </td>

                        {/* Column 2: Evidence */}
                        <td className="p-3 align-top">
                          <input
                            type="text"
                            value={row.evidence}
                            onChange={(e) => handleCellChange(cat.id, row.id, "evidence", e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs rounded-md bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-subtle)] focus:border-[var(--accent-primary-border)] focus:outline-none transition-colors font-mono"
                          />
                        </td>

                        {/* Column 3: Result & Rule Note */}
                        <td className="p-3 align-top">
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              {/* Verdict Select Dropdown */}
                              <select
                                value={row.verdict}
                                onChange={(e) =>
                                  handleCellChange(cat.id, row.id, "verdict", e.target.value as VerdictType)
                                }
                                className={`px-2.5 py-1 text-xs font-bold rounded-lg border focus:outline-none transition-all cursor-pointer ${
                                  row.verdict === "Match"
                                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                    : row.verdict === "Mismatch"
                                    ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                                    : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                }`}
                              >
                                <option value="Match">🟢 Match</option>
                                <option value="Mismatch">🔴 Mismatch</option>
                                <option value="Requires Human Review">🟠 Requires Review</option>
                              </select>

                              {row.isCustom && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30">
                                  Custom Case
                                </span>
                              )}
                            </div>

                            {/* Explanation Note Input */}
                            <input
                              type="text"
                              value={row.note}
                              onChange={(e) => handleCellChange(cat.id, row.id, "note", e.target.value)}
                              placeholder="Explanation of rule behavior..."
                              className="w-full px-2.5 py-1.5 text-xs rounded-md bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[var(--border-subtle)] focus:border-[var(--accent-primary-border)] focus:outline-none transition-colors"
                            />
                          </div>
                        </td>

                        {/* Action: Delete Row */}
                        <td className="p-3 align-middle text-center">
                          <button
                            onClick={() => handleDeleteRow(cat.id, row.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer opacity-80 group-hover:opacity-100"
                            title="Delete this test case row"
                          >
                            <IconTrash className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
