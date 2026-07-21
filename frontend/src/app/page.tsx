"use client";

import { useState, useEffect } from "react";
import {
  IconSearch,
  IconCopy,
  IconCheck,
  IconAlertTriangle,
  IconCircleCheck,
  IconExternalLink,
  IconLoader2,
  IconDatabase,
  IconFiles,
  IconPhoto,
  IconArrowUpRight,
  IconEdit,
  IconCoin,
  IconChevronDown,
  IconChevronLeft,
  IconList,
  IconX,
  IconDownload
} from "@tabler/icons-react";

interface AuditLog {
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

interface SupplierAssets {
  screenshots: string[];
  documents: { name: string; url: string }[];
}

export default function Dashboard() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [assets, setAssets] = useState<SupplierAssets>({ screenshots: [], documents: [] });
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "MATCH" | "MISMATCH">("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"comparison" | "assets">("comparison");
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [activeTableIdx, setActiveTableIdx] = useState<number | null>(null);
  const [expandedQaIdx, setExpandedQaIdx] = useState<number | null>(0);

  // New States for Data Editor & Cost tabs
  interface DocumentEvidence {
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

  const [activeMainTab, setActiveMainTab] = useState<"registry" | "editor" | "costs">("registry");
  const [evidenceLogs, setEvidenceLogs] = useState<DocumentEvidence[]>([]);
  const [isEvidenceLoading, setIsEvidenceLoading] = useState(false);

  // Data Editor States
  const [selectedSupplierName, setSelectedSupplierName] = useState<string>("");
  const [supplierSearchQuery, setSupplierSearchQuery] = useState("");
  const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<DocumentEvidence | null>(null);

  // Edit Form States
  const [formFields, setFormFields] = useState<Record<string, string>>({
    certificateOwnerName: "",
    issuerName: "",
    certificateType: "",
    certificateNumber: "",
    yearOfPublication: "",
    expirationDate: "",
    effectiveDate: "",
    certificateLocation: ""
  });

  const [initialFields, setInitialFields] = useState<Record<string, string>>({
    certificateOwnerName: "",
    issuerName: "",
    certificateType: "",
    certificateNumber: "",
    yearOfPublication: "",
    expirationDate: "",
    effectiveDate: "",
    certificateLocation: ""
  });

  const [isSavingForm, setIsSavingForm] = useState(false);
  const [formSuccessMessage, setFormSuccessMessage] = useState<string | null>(null);
  const [formErrorMessage, setFormErrorMessage] = useState<string | null>(null);

  // Per-table edit state for comparison table "Value in Evidence" cells
  const [editingTableIdx, setEditingTableIdx] = useState<number | null>(null);
  const [tableEditValues, setTableEditValues] = useState<Record<number, Record<number, string>>>({});
  const [isSavingTableEdits, setIsSavingTableEdits] = useState(false);
  const [tableEditMsg, setTableEditMsg] = useState<string | null>(null);

  const fieldNameToMetaKey: Record<string, string> = {
    "Certificate Type": "certificateType",
    "Supplier Name": "certificateOwnerName",
    "Issuer": "issuerName",
    "Year of Publication": "yearOfPublication",
    "Certificate Number": "certificateNumber",
    "Certificate Location": "certificateLocation",
    "Effective Date": "effectiveDate",
    "Expiration Date": "expirationDate"
  };

  // Fetch all DocumentEvidence logs
  const fetchEvidence = async () => {
    setIsEvidenceLoading(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/evidence");
      if (res.ok) {
        const data = await res.json();
        setEvidenceLogs(data);
      }
    } catch (err) {
      console.error("Failed to load document evidence logs:", err);
    } finally {
      setIsEvidenceLoading(false);
    }
  };

  useEffect(() => {
    fetchEvidence();
  }, []);

  // Handle selecting an evidence file for editing
  const handleSelectEvidence = (ev: DocumentEvidence) => {
    setSelectedEvidence(ev);
    setFormSuccessMessage(null);
    setFormErrorMessage(null);
    let targetFields = {
      certificateOwnerName: "",
      issuerName: "",
      certificateType: "",
      certificateNumber: "",
      yearOfPublication: "",
      expirationDate: "",
      effectiveDate: "",
      certificateLocation: ""
    };
    try {
      const parsed = JSON.parse(ev.gemini_extracted_metadata);
      targetFields = {
        certificateOwnerName: parsed.certificateOwnerName || "",
        issuerName: parsed.issuerName || "",
        certificateType: parsed.certificateType || "",
        certificateNumber: parsed.certificateNumber || "",
        yearOfPublication: parsed.yearOfPublication || "",
        expirationDate: parsed.expirationDate || "",
        effectiveDate: parsed.effectiveDate || "",
        certificateLocation: parsed.certificateLocation || ""
      };
    } catch (e) {
      console.error("Failed to parse evidence metadata:", e);
      targetFields = {
        certificateOwnerName: ev.gemini_extracted_supplier_name || "",
        issuerName: "",
        certificateType: "",
        certificateNumber: "",
        yearOfPublication: "",
        expirationDate: "",
        effectiveDate: "",
        certificateLocation: ""
      };
    }
    setFormFields(targetFields);
    setInitialFields(targetFields);
  };

  // Start editing a table — snapshot current evidence values into edit state
  const startTableEdit = (tIdx: number) => {
    const table = selectedLog?.comparison_table?.tables?.[tIdx];
    if (!table) return;
    const values: Record<number, string> = {};
    table.comparison_rows.forEach((row: any, rIdx: number) => {
      values[rIdx] = row.value_evidence;
    });
    setTableEditValues(prev => ({ ...prev, [tIdx]: values }));
    setEditingTableIdx(tIdx);
    setTableEditMsg(null);
  };

  const updateTableEditValue = (tIdx: number, rIdx: number, value: string) => {
    setTableEditValues(prev => ({
      ...prev,
      [tIdx]: { ...prev[tIdx], [rIdx]: value }
    }));
  };

  // Save all edits for a table at once
  const handleSaveTableEdits = async (tIdx: number) => {
    if (!selectedLog) return;
    const table = selectedLog.comparison_table?.tables?.[tIdx];
    if (!table) return;

    const filename = table.attached_file;
    if (!filename) {
      setTableEditMsg("Cannot determine which file this field belongs to.");
      setTimeout(() => setTableEditMsg(null), 3000);
      return;
    }

    setIsSavingTableEdits(true);
    setTableEditMsg(null);

    try {
      const evRecord = evidenceLogs.find(e =>
        e.audit_id === selectedLog.audit_id &&
        e.filename.toLowerCase() === filename.toLowerCase()
      );
      if (!evRecord) {
        throw new Error("No matching evidence record found for this file.");
      }

      let metadata: Record<string, string> = {};
      try {
        metadata = JSON.parse(evRecord.gemini_extracted_metadata);
      } catch { metadata = {}; }

      const edits = tableEditValues[tIdx] || {};
      table.comparison_rows.forEach((row: any, rIdx: number) => {
        if (edits[rIdx] !== undefined && edits[rIdx] !== row.value_evidence) {
          const metaKey = fieldNameToMetaKey[row.field_name] || row.field_name;
          metadata[metaKey] = edits[rIdx];
        }
      });

      const res = await fetch("http://127.0.0.1:8000/api/evidence", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audit_id: selectedLog.audit_id,
          filename,
          updated_metadata: metadata
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to save.");
      }

      const responseData = await res.json();

      await fetchEvidence();
      await fetchLogs();

      if (responseData.comparison_table) {
        setSelectedLog(prev => prev ? ({
          ...prev,
          result: responseData.audit_result || prev.result,
          suggested_comment: responseData.suggested_comment || prev.suggested_comment,
          comparison_table: responseData.comparison_table
        }) : null);
      }

      setEditingTableIdx(null);
      setTableEditMsg("Table values updated and comparison recalculated.");
      setTimeout(() => setTableEditMsg(null), 3000);
    } catch (err: any) {
      console.error(err);
      setTableEditMsg(err.message || "Save failed.");
      setTimeout(() => setTableEditMsg(null), 4000);
    } finally {
      setIsSavingTableEdits(false);
    }
  };

  function cleanQuestionLabel(label?: string): string {
    if (!label) return '';
    const parts = label.split(/\s+[-–—]\s*|\s*[-–—]\s+/);
    return parts[0] ? parts[0].trim() : label.trim();
  }

  // Handle saving the edited form fields
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvidence) return;

    setIsSavingForm(true);
    setFormSuccessMessage(null);
    setFormErrorMessage(null);

    try {
      const res = await fetch("http://127.0.0.1:8000/api/evidence", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          audit_id: selectedEvidence.audit_id,
          filename: selectedEvidence.filename,
          updated_metadata: formFields
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to save updates to Google Sheets.");
      }

      const responseData = await res.json();

      setFormSuccessMessage("Successfully saved changes! Comparison table recalculated.");
      setInitialFields(formFields);

      // Refresh local logs & evidence
      await fetchEvidence();
      await fetchLogs();

      // Update selected evidence in UI state
      const updatedEvidence = {
        ...selectedEvidence,
        gemini_extracted_supplier_name: formFields.certificateOwnerName,
        gemini_extracted_metadata: JSON.stringify(formFields)
      };
      setSelectedEvidence(updatedEvidence);

      // If currently selected log matches this audit_id, update selectedLog with recalculated comparison table & verdict
      if (selectedLog && selectedLog.audit_id === selectedEvidence.audit_id) {
        if (responseData.audit_result && responseData.comparison_table) {
          setSelectedLog(prev => prev ? ({
            ...prev,
            result: responseData.audit_result,
            suggested_comment: responseData.suggested_comment || prev.suggested_comment,
            comparison_table: responseData.comparison_table
          }) : null);
        }
      }
    } catch (err: any) {
      console.error(err);
      setFormErrorMessage(err.message || "An unexpected error occurred while saving.");
    } finally {
      setIsSavingForm(false);
    }
  };

  // Fetch all logs from Google Sheets
  const fetchLogs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/logs");
      if (!res.ok) {
        throw new Error(`Failed to load logs: HTTP ${res.status}`);
      }
      const data = await res.ok ? await res.json() : [];
      setLogs(data);
      if (data.length > 0 && !selectedLog) {
        handleSelectLog(data[0]);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Could not establish database connection.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleSelectLog = async (log: AuditLog) => {
    setSelectedLog(log);
    setActiveTableIdx(null);
    setExpandedQaIdx(0);
    setAssets({ screenshots: [], documents: [] });
    setAssetsLoading(true);
    setActiveTab("comparison");
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/logs/${encodeURIComponent(log.supplier_name)}/assets`);
      if (res.ok) {
        const data = await res.json();
        setAssets(data);
      }
    } catch (err) {
      console.error("Failed to load supplier assets:", err);
    } finally {
      setAssetsLoading(false);
    }
  };

  // Copy Suggested Comment logic
  const handleCopyComment = (comment: string) => {
    navigator.clipboard.writeText(comment);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Parse suggested comment & comparison table
  interface ComparisonTable {
    label: string;
    headers: string[];
    rows: string[][];
  }

  const getCommentAndTable = (fullComment: string) => {
    if (!fullComment) return { comment: "", table: null, tables: [] as ComparisonTable[] };

    if (fullComment.startsWith("Dear Sir/Madam") || fullComment === "All match." || !fullComment.includes("|")) {
      return { comment: fullComment, table: null, tables: [] as ComparisonTable[] };
    }

    // Check if it's the old format
    if (fullComment.includes(" | Comparison: ")) {
      const parts = fullComment.split(" | Comparison: ");
      const comment = parts[0];
      const rawTable = parts[1] || "";
      if (!rawTable || !rawTable.includes("|")) return { comment, table: null, tables: [] as ComparisonTable[] };
      const lines = rawTable.split("\n").map(l => l.trim()).filter(l => l.startsWith("|"));
      if (lines.length < 2) return { comment, table: null, tables: [] as ComparisonTable[] };
      const headers = lines[0].split("|").map(h => h.trim()).filter(h => h !== "");
      const rows = lines.slice(2).map(line => {
        return line.split("|").map(cell => cell.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      });
      return { comment, table: { headers, rows }, tables: [] as ComparisonTable[] };
    }

    // New format (multiple tables possible, or custom formatted suggested_comment)
    // We want to extract any markdown tables alongside their preceding label/headers.
    const lines = fullComment.split("\n");
    const tables: ComparisonTable[] = [];
    let currentLabel = "";
    let currentTableLines: string[] = [];
    const commentLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("|")) {
        currentTableLines.push(line);
      } else {
        if (currentTableLines.length > 0) {
          if (currentTableLines.length >= 2) {
            const headers = currentTableLines[0].split("|").map(h => h.trim()).filter(h => h !== "");
            const rows = currentTableLines.slice(2).map(l => {
              return l.split("|").map(cell => cell.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
            });
            tables.push({ label: currentLabel, headers, rows });
          }
          currentTableLines = [];
          currentLabel = "";
        }

        if (line) {
          if (line.startsWith("Supplier:")) {
            commentLines.push(line);
          } else {
            // Assume it's a label for the next table
            currentLabel = line;
          }
        }
      }
    }

    // Handle table at the end of text
    if (currentTableLines.length >= 2) {
      const headers = currentTableLines[0].split("|").map(h => h.trim()).filter(h => h !== "");
      const rows = currentTableLines.slice(2).map(l => {
        return l.split("|").map(cell => cell.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      });
      tables.push({ label: currentLabel, headers, rows });
    }

    const comment = commentLines.join("\n");
    return { comment, table: null, tables };
  };

  const getSupplierCosts = () => {
    const map: Record<string, { name: string; count: number; cost: number }> = {};
    evidenceLogs.forEach(ev => {
      const name = ev.supplier_name || "Unknown Supplier";
      if (!map[name]) {
        map[name] = { name, count: 0, cost: 0.0 };
      }
      const costMyr = ev.cost_myr || (ev.cost_usd ? ev.cost_usd * 4.70 : 0.0);
      map[name].count += 1;
      map[name].cost += costMyr;
    });
    return Object.values(map).sort((a, b) => b.cost - a.cost);
  };

  const supplierCosts = getSupplierCosts();
  const totalCost = evidenceLogs.reduce((acc, ev) => {
    const costMyr = ev.cost_myr || (ev.cost_usd ? ev.cost_usd * 4.70 : 0.0);
    return acc + costMyr;
  }, 0.0);
  const avgCost = evidenceLogs.length > 0 ? totalCost / evidenceLogs.length : 0.0;

  const isFormDirty = Object.keys(formFields).some(
    (key) => formFields[key] !== initialFields[key]
  );

  function getFilteredLogs(): AuditLog[] {
    return logs.filter(log => {
      const matchesSearch = log.supplier_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.cert_type.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "ALL" ||
        (statusFilter === "MATCH" && log.result.toLowerCase() === "match") ||
        (statusFilter === "MISMATCH" && log.result.toLowerCase() === "mismatch");
      return matchesSearch && matchesStatus;
    });
  }
  const filteredLogs = getFilteredLogs();

  // Filter supplier list in editor tab
  const uniqueSuppliers = Array.from(new Set(evidenceLogs.map(e => e.supplier_name)));
  const filteredSuppliers = uniqueSuppliers.filter(name =>
    name.toLowerCase().includes(supplierSearchQuery.toLowerCase())
  );

  const supplierFiles: DocumentEvidence[] = selectedSupplierName
    ? evidenceLogs.filter(e => e.supplier_name === selectedSupplierName)
    : [];

  return (
    <div className="flex-1 flex flex-col w-full p-4 md:p-8">
      {/* ── Header / Top Navigation ── */}
      <header className="flex justify-between items-center mb-6 pb-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">GPO Automatic Certificate Auditor</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Connection status dot */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-medium">
            <span className={`h-1.5 w-1.5 rounded-full ${error ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`}></span>
            {error ? "Database Offline" : "Database Live"}
          </div>

          <button
            onClick={() => { fetchLogs(); fetchEvidence(); }}
            className="flex items-center justify-center p-2 rounded-full bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 transition-all cursor-pointer active:scale-95"
            title="Refresh database"
          >
            <IconLoader2 className={`h-4 w-4 ${(isLoading || isEvidenceLoading) ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* ── Sub Navigation Tabs (Registry, Editor, Cost Analytics) ── */}
      <div className="flex gap-6 mb-8 border-b border-white/5 pb-0.5">
        <button
          onClick={() => setActiveMainTab("registry")}
          className={`pb-3 px-1 text-sm font-medium tracking-tight border-b-2 transition-all duration-300 ease-out cursor-pointer flex items-center gap-2 hover:text-white active:scale-[0.97] ${activeMainTab === "registry"
            ? "border-emerald-500 text-white font-semibold"
            : "border-transparent text-gray-500"
            }`}
        >
          <IconFiles className="h-4 w-4" />
          Audit Registry
        </button>
        <button
          onClick={() => setActiveMainTab("editor")}
          className={`pb-3 px-1 text-sm font-medium tracking-tight border-b-2 transition-all duration-300 ease-out cursor-pointer flex items-center gap-2 hover:text-white active:scale-[0.97] ${activeMainTab === "editor"
            ? "border-emerald-500 text-white font-semibold"
            : "border-transparent text-gray-500"
            }`}
        >
          <IconEdit className="h-4 w-4" />
          Supplier Data Editor
        </button>
        <button
          onClick={() => setActiveMainTab("costs")}
          className={`pb-3 px-1 text-sm font-medium tracking-tight border-b-2 transition-all duration-300 ease-out cursor-pointer flex items-center gap-2 hover:text-white active:scale-[0.97] ${activeMainTab === "costs"
            ? "border-emerald-500 text-white font-semibold"
            : "border-transparent text-gray-500"
            }`}
        >
          <IconCoin className="h-4 w-4" />
          Cost Analytics
        </button>
      </div>

      {/* ── Main Tab Views ── */}
      {error && logs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center double-bezel max-w-lg mx-auto my-12">
          <div className="double-bezel-inner flex flex-col items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500 glow-error">
              <IconAlertTriangle className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">Database connection failure</h3>
            <p className="text-sm text-gray-400 max-w-sm">
              We couldn't connect to the local Google Sheets database server. Make sure your FastAPI backend API is running at <code className="px-1.5 py-0.5 rounded bg-black/40 text-rose-400 font-mono text-xs">http://127.0.0.1:8000</code>.
            </p>
            <button
              onClick={() => { fetchLogs(); fetchEvidence(); }}
              className="mt-2 px-5 py-2.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs transition-all cursor-pointer active:scale-98 border border-white/5"
            >
              Retry Connection
            </button>
          </div>
        </div>
      ) : activeMainTab === "registry" ? (
        /* ==================== AUDIT REGISTRY TAB ==================== */
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {!selectedLog && (
            <section className="lg:col-span-5 flex flex-col min-h-[600px] double-bezel">
              <div className="double-bezel-inner flex-1 flex flex-col h-full">
                {/* Search and Filters */}
                <div className="mb-6 space-y-4">
                  <div className="relative">
                    <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 h-4.5 w-4.5" />
                    <input
                      type="text"
                      placeholder="Search supplier"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-black/40 border border-white/5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-500/30 transition-all font-sans"
                    />
                  </div>
                  <div className="flex gap-2">
                    {(["ALL", "MATCH", "MISMATCH"] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setStatusFilter(f)}
                        className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider transition-all duration-300 ease-out cursor-pointer active:scale-[0.97] ${statusFilter === f
                          ? "bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 shadow-md"
                          : "bg-white/5 text-gray-400 hover:bg-white/10"
                          }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Log List */}
                <div className="flex-1 overflow-y-auto space-y-3 max-h-[620px] pr-2">
                  {isLoading ? (
                    Array.from({ length: 4 }).map((_, idx) => (
                      <div key={idx} className="p-4 rounded-xl border border-white/5 bg-white/[0.01] animate-pulse">
                        <div className="h-4 w-3/4 bg-white/10 rounded mb-2"></div>
                        <div className="h-3 w-1/2 bg-white/10 rounded"></div>
                      </div>
                    ))
                  ) : filteredLogs.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <p className="text-sm">No audit logs match current filters.</p>
                    </div>
                  ) : (
                    (filteredLogs as any[]).map((log) => {
                      const isSelected = selectedLog?.timestamp === log.timestamp && selectedLog?.supplier_name === log.supplier_name;
                      const isMatch = log.result.toLowerCase() === "match";
                      return (
                        <div
                          key={`${log.timestamp}-${log.supplier_name}`}
                          onClick={() => handleSelectLog(log)}
                          className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer relative group overflow-hidden ${isSelected
                            ? "bg-white/[0.03] border-emerald-500/20 glow-success"
                            : "bg-white/[0.01] border-white/5 hover:border-white/15 hover:bg-white/[0.02]"
                            }`}
                        >
                          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h4 className="font-semibold text-sm text-white group-hover:text-emerald-400 transition-colors">
                                {log.supplier_name}
                              </h4>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase shrink-0 ${isMatch
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              }`}>
                              {log.result}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Right Column: Inspect & Audit Details Pane */}
          <section className={`${selectedLog ? "lg:col-span-12" : "lg:col-span-7"} flex flex-col double-bezel`}>
            <div className="double-bezel-inner flex-1 flex flex-col h-full">
              {selectedLog ? (
                <div className="flex-1 flex flex-col h-full">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 pb-4 border-b border-white/5 gap-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setSelectedLog(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-semibold text-gray-300 hover:text-white transition-all cursor-pointer active:scale-95 shrink-0"
                      >
                        <IconChevronLeft className="h-4 w-4" />
                        Back to List
                      </button>
                      <h2 className="text-xl font-bold text-white tracking-tight">{selectedLog.supplier_name}</h2>
                    </div>
                  </div>

                  {/* Details Sub Tabs */}
                  <div className="flex gap-4 mb-6 border-b border-white/5">
                    <button
                      onClick={() => setActiveTab("comparison")}
                      className={`pb-2.5 px-0.5 text-xs font-semibold tracking-wider uppercase border-b-2 transition-all duration-300 ease-out cursor-pointer active:scale-[0.97] ${activeTab === "comparison"
                        ? "border-emerald-500 text-white font-bold"
                        : "border-transparent text-gray-500 hover:text-gray-400"
                        }`}
                    >
                      Audit Results
                    </button>
                    <button
                      onClick={() => setActiveTab("assets")}
                      className={`pb-2.5 px-0.5 text-xs font-semibold tracking-wider uppercase border-b-2 transition-all duration-300 ease-out cursor-pointer active:scale-[0.97] ${activeTab === "assets"
                        ? "border-emerald-500 text-white font-bold"
                        : "border-transparent text-gray-500 hover:text-gray-400"
                        }`}
                    >
                      Evidence
                    </button>
                  </div>

                  {/* TAB Content */}
                  {activeTab === "comparison" && (
                    <div className="flex-1 flex flex-col gap-6 overflow-y-auto max-h-[620px] pr-2">
                      <div className="p-4 rounded-xl border border-white/5 bg-black/40">
                        <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">Overall Auditor Verdict</h4>
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${selectedLog.result.toLowerCase() === "match"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 glow-success"
                            : "bg-rose-500/10 text-rose-400 border border-rose-500/20 glow-error"
                            }`}>
                            {selectedLog.result}
                          </span>
                          <span className="text-xs text-gray-400">
                            {selectedLog.result.toLowerCase() === "match"
                              ? "Audit passed. Documents verify questionnaire values."
                              : "Audit failed. One or more fields require revisions."}
                          </span>
                        </div>
                      </div>

                      {(() => {
                        const { comment, table, tables } = getCommentAndTable(selectedLog.suggested_comment);
                        const hasJsonTable = selectedLog.comparison_table &&
                          Array.isArray(selectedLog.comparison_table.tables);
                        return (
                          <>
                            <div className="p-4 rounded-xl border border-white/5 bg-black/40 relative">
                              <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Suggested comment</h4>
                              <p className="text-sm text-gray-300 italic font-medium pr-10 leading-relaxed whitespace-pre-wrap">
                                "{comment || "No detailed comments provided."}"
                              </p>
                              <button
                                onClick={() => handleCopyComment(comment)}
                                className="absolute right-4 top-4 p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-300 cursor-pointer active:scale-95 text-gray-400 hover:text-white"
                                title="Copy suggested comment"
                              >
                                {copied ? <IconCheck className="h-4.5 w-4.5 text-emerald-400" /> : <IconCopy className="h-4.5 w-4.5" />}
                              </button>
                            </div>

                            {hasJsonTable ? (
                              <div className="p-5 rounded-xl border border-white/5 bg-black/40 space-y-6">
                                {tableEditMsg && (
                                  <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${tableEditMsg.includes("recalculated")
                                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                                    : "bg-rose-500/10 border border-rose-500/20 text-rose-400"
                                    }`}>
                                    {tableEditMsg.includes("recalculated") ? <IconCircleCheck className="h-4 w-4 shrink-0" /> : <IconAlertTriangle className="h-4 w-4 shrink-0" />}
                                    <span>{tableEditMsg}</span>
                                  </div>
                                )}
                                <div className="border-b border-white/5 pb-3">

                                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Comparison Tables</h4>
                                  <h3 className="text-sm font-bold text-white tracking-wide">
                                    Supplier Name: <span className="text-emerald-400">{selectedLog.comparison_table.supplier_name || selectedLog.supplier_name}</span>
                                  </h3>
                                </div>

                                {selectedLog.comparison_table.tables.map((t: any, tIdx: number) => {
                                  const isActive = activeTableIdx === tIdx;
                                  const matchingDoc = t.attached_file
                                    ? assets.documents.find(doc =>
                                      doc.name.toLowerCase() === t.attached_file.toLowerCase() ||
                                      t.attached_file.toLowerCase().includes(doc.name.toLowerCase()) ||
                                      doc.name.toLowerCase().includes(t.attached_file.toLowerCase())
                                    )
                                    : null;
                                  const pdfUrl = matchingDoc ? `http://127.0.0.1:8000${matchingDoc.url}` : null;

                                  return (
                                    <div
                                      key={tIdx}
                                      onClick={() => setActiveTableIdx(isActive ? null : tIdx)}
                                      className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer ${isActive
                                        ? "bg-emerald-500/[0.02] border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.04)]"
                                        : "bg-white/[0.01] border-white/5 hover:bg-white/[0.02] hover:border-emerald-500/15"
                                        }`}
                                    >
                                      <div className={isActive && pdfUrl ? "grid grid-cols-1 xl:grid-cols-12 gap-6" : "space-y-3"}>
                                        {isActive && pdfUrl && (
                                          <div
                                            className="xl:col-span-5 h-[400px] border border-white/5 bg-black/40 rounded-lg overflow-hidden flex flex-col"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <div className="px-3 py-1.5 border-b border-white/5 bg-white/[0.02] flex justify-between items-center text-[10px] text-gray-400 font-mono">
                                              <span className="truncate pr-4">{t.attached_file}</span>
                                              <a
                                                href={pdfUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-emerald-400 hover:underline flex items-center gap-1 hover:text-emerald-300 transition-colors"
                                              >
                                                Open PDF <IconExternalLink className="h-3 w-3" />
                                              </a>
                                            </div>
                                            <iframe
                                              src={`${pdfUrl}#toolbar=0`}
                                              className="w-full flex-1 border-0"
                                              title="PDF Document Viewer"
                                            />
                                          </div>
                                        )}

                                        <div className={isActive && pdfUrl ? "xl:col-span-7 space-y-3" : "space-y-3"}>
                                          {t.question_label && (
                                            <div className="flex flex-row justify-between items-start gap-2 mt-1">
                                              <h4 className="text-xs font-bold text-gray-200 tracking-wide">
                                                {t.question_label}
                                              </h4>
                                              <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                {editingTableIdx === tIdx ? (
                                                  <>
                                                    <button
                                                      onClick={() => handleSaveTableEdits(tIdx)}
                                                      disabled={isSavingTableEdits}
                                                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold tracking-wide transition-all cursor-pointer active:scale-95 flex items-center gap-1 disabled:opacity-50"
                                                    >
                                                      {isSavingTableEdits ? <IconLoader2 className="h-3 w-3 animate-spin" /> : <IconCheck className="h-3.5 w-3.5" />}
                                                      Save
                                                    </button>
                                                    <button
                                                      onClick={() => setEditingTableIdx(null)}
                                                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-gray-400 hover:text-white text-[10px] font-semibold tracking-wide transition-all cursor-pointer active:scale-95 flex items-center gap-1"
                                                    >
                                                      <IconX className="h-3.5 w-3.5" />
                                                      Cancel
                                                    </button>
                                                  </>
                                                ) : (
                                                  <button
                                                    onClick={() => startTableEdit(tIdx)}
                                                    className="p-1 rounded-lg bg-white/5 border border-white/10 hover:bg-white/15 text-gray-500 hover:text-emerald-400 transition-all cursor-pointer active:scale-90"
                                                    title="Edit all values in evidence"
                                                  >
                                                    <IconEdit className="h-3.5 w-3.5" />
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          )}
                                          <div className="overflow-x-auto rounded-lg border border-white/5 bg-black/20">
                                            <table className="min-w-full text-left text-xs font-sans text-gray-300" style={{ tableLayout: 'fixed' }}>
                                              <colgroup>
                                                <col style={{ width: '15%' }} />
                                                <col style={{ width: '35%' }} />
                                                <col style={{ width: '35%' }} />
                                                <col style={{ width: '15%' }} />
                                              </colgroup>
                                              <thead>
                                                <tr className="border-b border-emerald-500/20 font-bold text-emerald-400 bg-emerald-950/35 backdrop-blur-sm">
                                                  <th className="py-2.5 px-3 uppercase tracking-wider text-[10px] border-r border-white/10">Field</th>
                                                  <th className="py-2.5 px-3 uppercase tracking-wider text-[10px] border-r border-white/10">Value in Evidence</th>
                                                  <th className="py-2.5 px-3 uppercase tracking-wider text-[10px] border-r border-white/10">Value in QA Data</th>
                                                  <th className="py-2.5 px-3 uppercase tracking-wider text-[10px]">Result</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {t.comparison_rows.map((row: any, rIdx: number) => {
                                                  const isMatch = row.result.toLowerCase() === "match";
                                                  const isMismatch = row.result.toLowerCase() === "mismatch";
                                                  return (
                                                    <tr key={rIdx} className="hover:bg-white/[0.01] border-b border-white/5">
                                                      <td className="py-2.5 px-3 text-gray-300 font-medium border-r border-white/5 whitespace-normal break-words align-top">{row.field_name}</td>
                                                      <td className="py-2.5 px-3 text-gray-300 font-medium border-r border-white/5 whitespace-normal break-words align-top">
                                                        {editingTableIdx === tIdx ? (
                                                          <textarea
                                                            value={tableEditValues[tIdx]?.[rIdx] ?? row.value_evidence}
                                                            onChange={(e) => updateTableEditValue(tIdx, rIdx, e.target.value)}
                                                            className="w-full bg-transparent border border-emerald-500/30 rounded px-1.5 py-1 text-xs font-sans text-gray-200 resize-none focus:outline-none focus:border-emerald-500/60 transition-colors"
                                                            rows={2}
                                                          />
                                                        ) : (
                                                          <div className="whitespace-normal break-words">{row.value_evidence}</div>
                                                        )}
                                                      </td>
                                                      <td className="py-2.5 px-3 text-gray-300 font-medium border-r border-white/5 whitespace-normal break-words align-top">{row.value_qa}</td>
                                                      <td className="py-2.5 px-3 text-gray-300 font-medium whitespace-normal break-words align-top">
                                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${isMatch
                                                          ? "bg-emerald-500/10 text-emerald-400"
                                                          : isMismatch
                                                            ? "bg-rose-500/10 text-rose-400"
                                                            : "bg-amber-500/10 text-amber-400"
                                                          }`}>
                                                          {row.result}
                                                        </span>
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
                                })}
                              </div>
                            ) : (
                              <div className="p-5 rounded-xl border border-white/5 bg-black/40 space-y-6">
                                <div className="border-b border-white/5 pb-3">
                                  <h3 className="text-sm font-bold text-white tracking-wide">
                                    Supplier Name: <span className="text-emerald-400">{selectedLog.supplier_name}</span>
                                  </h3>
                                </div>
                                {table && (
                                  <div className="p-4 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.02] hover:border-emerald-500/15 transition-all duration-300 space-y-3 cursor-pointer">
                                    <div className="overflow-x-auto rounded-lg border border-white/5 bg-black/20">
                                      <table className="min-w-full text-left text-xs font-sans text-gray-300" style={{ tableLayout: 'fixed' }}>
                                        <colgroup>
                                          <col style={{ width: '15%' }} />
                                          <col style={{ width: '35%' }} />
                                          <col style={{ width: '35%' }} />
                                          <col style={{ width: '15%' }} />
                                        </colgroup>
                                        <thead>
                                          <tr className="border-b border-emerald-500/20 font-bold text-emerald-400 bg-emerald-950/35 backdrop-blur-sm">
                                            {table.headers.map((h, i) => (
                                              <th key={i} className={`py-2.5 px-3 uppercase tracking-wider text-[10px] ${i < table.headers.length - 1 ? 'border-r border-white/10' : ''}`}>{h}</th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {table.rows.map((row, rIdx) => (
                                            <tr key={rIdx} className="hover:bg-white/[0.01] border-b border-white/5">
                                              {row.map((cell, cIdx) => {
                                                const isStatusCell = cIdx === row.length - 1;
                                                const cleanCell = cell.trim();
                                                const isMatch = cleanCell.toLowerCase() === "match";
                                                const isMismatch = cleanCell.toLowerCase() === "mismatch";
                                                return (
                                                  <td key={cIdx} className={`py-2.5 px-3 text-gray-300 font-medium whitespace-normal break-words align-top ${cIdx < row.length - 1 ? 'border-r border-white/5' : ''}`}>
                                                    {isStatusCell ? (
                                                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${isMatch
                                                        ? "bg-emerald-500/10 text-emerald-400"
                                                        : isMismatch
                                                          ? "bg-rose-500/10 text-rose-400"
                                                          : "bg-amber-500/10 text-amber-400"
                                                        }`}>
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

                                {tables && tables.map((t, tIdx) => (
                                  <div key={tIdx} className="p-4 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.02] hover:border-emerald-500/15 transition-all duration-300 space-y-3 cursor-pointer">
                                    {t.label && (
                                      <h4 className="text-xs font-bold text-gray-200 tracking-wide mt-2">
                                        {t.label}
                                      </h4>
                                    )}
                                    <div className="overflow-x-auto rounded-lg border border-white/5 bg-black/20">
                                      <table className="min-w-full text-left text-xs font-sans text-gray-300" style={{ tableLayout: 'fixed' }}>
                                        <colgroup>
                                          <col style={{ width: '15%' }} />
                                          <col style={{ width: '35%' }} />
                                          <col style={{ width: '35%' }} />
                                          <col style={{ width: '15%' }} />
                                        </colgroup>
                                        <thead>
                                          <tr className="border-b border-emerald-500/20 font-bold text-emerald-400 bg-emerald-950/35 backdrop-blur-sm">
                                            {t.headers.map((h, i) => (
                                              <th key={i} className={`py-2.5 px-3 uppercase tracking-wider text-[10px] ${i < t.headers.length - 1 ? 'border-r border-white/10' : ''}`}>{h}</th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {t.rows.map((row, rIdx) => (
                                            <tr key={rIdx} className="hover:bg-white/[0.01] border-b border-white/5">
                                              {row.map((cell, cIdx) => {
                                                const isStatusCell = cIdx === row.length - 1;
                                                const cleanCell = cell.trim();
                                                const isMatch = cleanCell.toLowerCase() === "match";
                                                const isMismatch = cleanCell.toLowerCase() === "mismatch";
                                                return (
                                                  <td key={cIdx} className={`py-2.5 px-3 text-gray-300 font-medium whitespace-normal break-words align-top ${cIdx < row.length - 1 ? 'border-r border-white/5' : ''}`}>
                                                    {isStatusCell ? (
                                                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${isMatch
                                                        ? "bg-emerald-500/10 text-emerald-400"
                                                        : isMismatch
                                                          ? "bg-rose-500/10 text-rose-400"
                                                          : "bg-amber-500/10 text-amber-400"
                                                        }`}>
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
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {activeTab === "assets" && (
                    <div className="flex-1 flex flex-col gap-6 overflow-y-auto max-h-[620px] pr-2">
                      {/* Paired Q&A and Audited Attachments List */}
                      <div className="space-y-6">
                        {(() => {
                          try {
                            const matchingEvidence = evidenceLogs.filter(e => e.audit_id === selectedLog.audit_id);
                            const visibleDocs = assets.documents.filter(doc => doc.name.toLowerCase() !== "qa_data.json");

                            // Reconstruct the Q&A blocks from the evidence logs matching this audit_id
                            const parsedQA = matchingEvidence.map(e => {
                              let answers = [];
                              try {
                                answers = JSON.parse(e.ariba_qa_answers || "[]");
                              } catch (err) {
                                console.error(err);
                              }
                              return {
                                questionLabel: e.ariba_question_label,
                                filename: e.filename,
                                answers: answers,
                                original_evidence: e
                              };
                            });

                            // Sort blocks by question number prefix
                            const getLabelSortKey = (label: string): number[] => {
                              const match = label.trim().match(/^(\d+(?:\.\d+)*)/);
                              if (match) {
                                return match[1].split('.').map(Number);
                              }
                              return [999];
                            };

                            parsedQA.sort((a, b) => {
                              const keyA = getLabelSortKey(a.questionLabel);
                              const keyB = getLabelSortKey(b.questionLabel);
                              for (let i = 0; i < Math.max(keyA.length, keyB.length); i++) {
                                const valA = keyA[i] ?? 0;
                                const valB = keyB[i] ?? 0;
                                if (valA !== valB) return valA - valB;
                              }
                              return 0;
                            });

                            if (parsedQA.length === 0) {
                              return <p className="text-sm text-gray-500 italic">No evidence records found.</p>;
                            }

                            return parsedQA.map((item: any, idx: number) => {
                              const ev = item.original_evidence;
                              const matchingDoc = visibleDocs.find(d =>
                                d.name.toLowerCase() === ev.filename.toLowerCase() ||
                                ev.filename.toLowerCase().includes(d.name.toLowerCase()) ||
                                d.name.toLowerCase().includes(ev.filename.toLowerCase())
                              );

                              let geminiData = null;
                              try {
                                geminiData = JSON.parse(ev.gemini_extracted_metadata || "{}");
                              } catch (err) {
                                console.error(err);
                              }

                              return (
                                <div key={idx} className="p-4 rounded-xl border border-white/5 bg-black/40 space-y-4">
                                  {/* Title section: Filename and Question Label */}
                                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-white/5 pb-2.5">
                                    <h4 className="text-xs font-bold text-white truncate max-w-full sm:max-w-[450px]">
                                      {cleanQuestionLabel(ev.ariba_question_label)}
                                    </h4>
                                    {ev.ariba_question_label && (
                                      <span className="text-[9px] uppercase font-bold text-emerald-400 tracking-wider px-2 py-0.5 rounded bg-emerald-500/[0.04] border border-emerald-500/10 shrink-0">
                                        {ev.filename}
                                      </span>
                                    )}
                                  </div>

                                  {/* Grid side-by-side: Q&A on Left, Document details on Right */}
                                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                    {/* Left Panel: Questionnaire Answers */}
                                    <div className="lg:col-span-6 space-y-2.5">
                                      <h5 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Questionnaire Answers</h5>
                                      {item.answers.length === 0 ? (
                                        <p className="text-xs text-gray-500 italic">No Q&A Answers available.</p>
                                      ) : (
                                        <div className="p-3 rounded-lg bg-white/[0.01] border border-white/5 space-y-2">
                                          {item.answers.map((ans: any, aIdx: number) => (
                                            <div key={aIdx} className="text-xs flex gap-2">
                                              <span className="text-gray-500 font-medium shrink-0">{ans.label}:</span>
                                              <span className="text-gray-300 font-medium">{ans.value}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    {/* Right Panel: Extracted Document Details */}
                                    <div className="lg:col-span-6 space-y-2.5">
                                      <div className="flex justify-between items-center">
                                        <h5 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Extracted Metadata</h5>
                                        {matchingDoc && (
                                          <a
                                            href={`http://127.0.0.1:8000${matchingDoc.url}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center gap-1 text-[9px] text-emerald-400 hover:underline hover:text-emerald-300 transition-colors"
                                          >
                                            Open PDF <IconArrowUpRight className="h-3 w-3" />
                                          </a>
                                        )}
                                      </div>
                                      {geminiData && Object.keys(geminiData).length > 0 ? (
                                        <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5 text-[11px] space-y-1.5 font-mono text-gray-400">
                                          <div className="flex justify-between gap-2">
                                            <span>Extracted Supplier:</span>
                                            <span className="text-white truncate max-w-[140px] font-sans">{geminiData.certificateOwnerName || 'N/A'}</span>
                                          </div>
                                          <div className="flex justify-between gap-2">
                                            <span>Issuer Name:</span>
                                            <span className="text-white truncate max-w-[140px] font-sans">{geminiData.issuerName || 'N/A'}</span>
                                          </div>
                                          <div className="flex justify-between gap-2">
                                            <span>Cert Type:</span>
                                            <span className="text-white truncate max-w-[140px] font-sans">{geminiData.certificateType || 'N/A'}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span>Cert Number:</span>
                                            <span className="text-white">{geminiData.certificateNumber || 'N/A'}</span>
                                          </div>
                                          <div className="flex justify-between gap-2">
                                            <span>Location:</span>
                                            <span className="text-white truncate max-w-[150px] font-sans">{geminiData.certificateLocation || 'N/A'}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span>Effective Date:</span>
                                            <span className="text-white">{geminiData.effectiveDate || 'N/A'}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span>Expiration Date:</span>
                                            <span className="text-white">{geminiData.expirationDate || 'N/A'}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span>Publication Year:</span>
                                            <span className="text-white">{geminiData.yearOfPublication || 'N/A'}</span>
                                          </div>
                                        </div>
                                      ) : (
                                        <p className="text-xs text-gray-500 italic">No extracted metadata available.</p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            });
                          } catch (err) {
                            console.error(err);
                            return <p className="text-sm text-rose-400 italic">Failed to build paired comparison blocks.</p>;
                          }
                        })()}
                      </div>

                      {/* Screenshots Section at bottom, taking 10% width */}
                      {assets.screenshots.length > 0 && (
                        <div className="border-t border-white/5 pt-6 mt-6">
                          <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <IconPhoto className="h-4.5 w-4.5 text-emerald-400" />
                            Audit Validation Screen Captures ({assets.screenshots.length})
                          </h4>
                          {assetsLoading ? (
                            <div className="h-16 bg-white/[0.02] border border-white/5 rounded-xl animate-pulse"></div>
                          ) : (
                            <div className="flex flex-wrap gap-3">
                              {assets.screenshots.map((shot, idx) => {
                                const fullShotUrl = shot.startsWith("http") ? shot : `http://127.0.0.1:8000${shot}`;
                                return (
                                  <div
                                    key={idx}
                                    onClick={() => setSelectedScreenshot(fullShotUrl)}
                                    className="w-[10%] min-w-[80px] aspect-video border border-white/5 rounded overflow-hidden relative group cursor-zoom-in bg-black/40"
                                    title="Expand capture"
                                  >
                                    <img
                                      src={fullShotUrl}
                                      alt="Audit verification capture"
                                      className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300"
                                    />
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-300">
                                      <IconExternalLink className="h-3 w-3 text-white" />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <div className="h-14 w-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 mb-4">
                    <IconFiles className="h-6 w-6" />
                  </div>
                  <h3 className="text-md font-semibold text-white">Select a supplier log</h3>
                  <p className="text-sm text-gray-500 max-w-xs mt-1">
                    Choose an entry from the registry panel to check detail comparisons, verification documents, and validation screenshots.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : activeMainTab === "editor" ? (
        /* ==================== SUPPLIER DATA EDITOR TAB ==================== */
        selectedEvidence ? (
          /* ── Certificate selected: full-width file viewer + edit form ── */
          <div className="flex-1 flex flex-col gap-5 min-h-[600px]">

            {/* Breadcrumb / Back strip */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setSelectedEvidence(null);
                  setFormSuccessMessage(null);
                  setFormErrorMessage(null);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-200 cursor-pointer active:scale-95 shrink-0"
              >
                <IconChevronLeft className="h-3.5 w-3.5" />
                Change Certificate
              </button>
              <div className="flex items-center gap-1.5 text-xs min-w-0">
                <span className="text-emerald-400 font-semibold shrink-0">{selectedSupplierName}</span>
                <span className="text-gray-600">/</span>
                <span className="text-gray-300 font-medium truncate">{selectedEvidence.filename}</span>
              </div>
            </div>

            {/* Two-panel layout */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">

              {/* ── Left Panel: PDF / File Viewer ── */}
              <section className="lg:col-span-7 flex flex-col double-bezel">
                <div className="double-bezel-inner flex-1 flex flex-col h-full" style={{ minHeight: '780px' }}>
                  {(() => {
                    const safeName = selectedEvidence.supplier_name.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
                    const fileUrl = selectedEvidence.file_url || `http://127.0.0.1:8000/static/${safeName}/${selectedEvidence.filename}`;
                    const ct = (selectedEvidence.file_content_type || '').toLowerCase();
                    return (
                      <>
                        <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5 shrink-0">
                          <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Certificate Document</h3>
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[10px] text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-200 cursor-pointer active:scale-95"
                          >
                            <IconArrowUpRight className="h-3.5 w-3.5" />
                            Open in Tab
                          </a>
                        </div>

                        {/* Adaptive file renderer */}
                        {ct.includes('pdf') ? (
                          <iframe
                            src={`${fileUrl}#zoom=100&toolbar=0`}
                            title="Certificate PDF"
                            className="flex-1 w-full rounded-xl border border-white/5 bg-black/30"
                            style={{ minHeight: '700px' }}
                          />
                        ) : ct.startsWith('image/') ? (
                          <div
                            className="flex-1 flex items-center justify-center rounded-xl border border-white/5 bg-black/30 overflow-hidden"
                            style={{ minHeight: '700px' }}
                          >
                            <img
                              src={fileUrl}
                              alt="Certificate document"
                              className="max-w-full max-h-full object-contain"
                            />
                          </div>
                        ) : (
                          <div
                            className="flex-1 flex flex-col items-center justify-center rounded-xl border border-white/5 bg-black/30 gap-4"
                            style={{ minHeight: '700px' }}
                          >
                            <div className="h-14 w-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-500">
                              <IconFiles className="h-7 w-7" />
                            </div>
                            <div className="text-center">
                              <p className="text-sm font-semibold text-white">Preview unavailable for this format</p>
                              <p className="text-xs text-gray-500 mt-1">Download file to view the content details.</p>
                            </div>
                            <a
                              href={fileUrl}
                              download
                              className="flex items-center gap-1.5 px-4.5 py-2 rounded-xl bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500 transition-all duration-300 cursor-pointer active:scale-95 glow-success mt-2"
                            >
                              <IconDownload className="h-4 w-4" />
                              Open / Download File
                            </a>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </section>

              {/* ── Right Panel: OCR Edit Form ── */}
              <section className="lg:col-span-5 flex flex-col double-bezel">
                <div className="double-bezel-inner flex-1 flex flex-col h-full justify-between">
                  <form onSubmit={handleSaveForm} className="flex-1 flex flex-col h-full justify-between">
                    <div className="space-y-6">
                      <div className="border-b border-white/5 pb-4">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/[0.04] border border-emerald-500/10 px-2 py-0.5 rounded-full">
                            Document Data
                          </span>
                          <span className="text-[10px] text-gray-500 font-mono font-medium">{selectedEvidence.timestamp}</span>
                        </div>
                        <h3 className="text-lg text-gray-500 mt-2 truncate">File name: <span className="font-bold text-white"> {selectedEvidence.filename}</span></h3>
                        <p className="text-xs text-gray-500 mt-1">Supplier: <span className="font-semibold text-gray-300">{selectedEvidence.supplier_name}</span></p>
                      </div>

                      {/* Feedback messages */}
                      {formSuccessMessage && (
                        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2 glow-success animate-fade-in">
                          <IconCircleCheck className="h-4.5 w-4.5 shrink-0" />
                          <span>{formSuccessMessage}</span>
                        </div>
                      )}
                      {formErrorMessage && (
                        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-center gap-2 glow-error animate-fade-in">
                          <IconAlertTriangle className="h-4.5 w-4.5 shrink-0" />
                          <span>{formErrorMessage}</span>
                        </div>
                      )}

                      {/* Input Fields Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-semibold text-gray-400 block mb-1">Supplier name</label>
                          <input
                            type="text"
                            value={formFields.certificateOwnerName}
                            onChange={(e) => setFormFields({ ...formFields, certificateOwnerName: e.target.value })}
                            className="w-full px-4.5 py-2.5 rounded-xl bg-black/40 border border-white/5 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/30 transition-all duration-300 font-sans"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-gray-400 block mb-1">Issuer name</label>
                          <input
                            type="text"
                            value={formFields.issuerName}
                            onChange={(e) => setFormFields({ ...formFields, issuerName: e.target.value })}
                            className="w-full px-4.5 py-2.5 rounded-xl bg-black/40 border border-white/5 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/30 transition-all duration-300 font-sans"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-gray-400 block mb-1">Certificate type</label>
                          <input
                            type="text"
                            value={formFields.certificateType}
                            onChange={(e) => setFormFields({ ...formFields, certificateType: e.target.value })}
                            className="w-full px-4.5 py-2.5 rounded-xl bg-black/40 border border-white/5 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/30 transition-all duration-300 font-sans"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-gray-400 block mb-1">Certificate number</label>
                          <input
                            type="text"
                            value={formFields.certificateNumber}
                            onChange={(e) => setFormFields({ ...formFields, certificateNumber: e.target.value })}
                            className="w-full px-4.5 py-2.5 rounded-xl bg-black/40 border border-white/5 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/30 transition-all duration-300 font-sans"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-gray-400 block mb-1">Year of publication</label>
                          <input
                            type="text"
                            value={formFields.yearOfPublication || ""}
                            onChange={(e) => setFormFields({ ...formFields, yearOfPublication: e.target.value })}
                            placeholder="YYYY"
                            className="w-full px-4.5 py-2.5 rounded-xl bg-black/40 border border-white/5 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/30 transition-all duration-300 font-sans"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="text-[10px] font-semibold text-gray-400 block mb-1">Certificate location</label>
                          <input
                            type="text"
                            value={formFields.certificateLocation}
                            onChange={(e) => setFormFields({ ...formFields, certificateLocation: e.target.value })}
                            placeholder="State, Country"
                            className="w-full px-4.5 py-2.5 rounded-xl bg-black/40 border border-white/5 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/30 transition-all duration-300 font-sans"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-gray-400 block mb-1">Effective date (DD/MM/YYYY)</label>
                          <input
                            type="text"
                            value={formFields.effectiveDate}
                            onChange={(e) => setFormFields({ ...formFields, effectiveDate: e.target.value })}
                            placeholder="DD/MM/YYYY"
                            className="w-full px-4.5 py-2.5 rounded-xl bg-black/40 border border-white/5 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/30 transition-all duration-300 font-sans"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-gray-400 block mb-1">Expiration date (DD/MM/YYYY)</label>
                          <input
                            type="text"
                            value={formFields.expirationDate}
                            onChange={(e) => setFormFields({ ...formFields, expirationDate: e.target.value })}
                            placeholder="DD/MM/YYYY"
                            className="w-full px-4.5 py-2.5 rounded-xl bg-black/40 border border-white/5 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/30 transition-all duration-300 font-sans"
                            required
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 border-t border-white/5 pt-4 flex justify-end">
                      <button
                        type="submit"
                        disabled={isSavingForm || !isFormDirty}
                        className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold tracking-wide transition-all duration-300 ease-out cursor-pointer active:scale-[0.97] flex items-center gap-2 glow-success disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSavingForm ? (
                          <>
                            <IconLoader2 className="h-4 w-4 animate-spin" /> Saving Changes...
                          </>
                        ) : (
                          "Save"
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </section>
            </div>
          </div>
        ) : (
          /* ── No certificate selected: supplier selector + empty state ── */
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch min-h-[600px]">
            {/* Left Column: Supplier list and certificate list */}
            <section className="lg:col-span-4 flex flex-col min-h-[600px] double-bezel">
              <div className="double-bezel-inner flex-1 flex flex-col h-full">
                {!selectedSupplierName ? (
                  <>
                    <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-4">Supplier Registry</h3>
                    {/* Search Supplier input */}
                    <div className="relative mb-6">
                      <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 h-4.5 w-4.5" />
                      <input
                        type="text"
                        placeholder="Search supplier..."
                        value={supplierSearchQuery}
                        onChange={(e) => setSupplierSearchQuery(e.target.value)}
                        className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-black/40 border border-white/5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-500/30 transition-all font-sans"
                      />
                    </div>
                    {/* List of Suppliers */}
                    <div className="flex-1 overflow-y-auto space-y-3 max-h-[480px] pr-2">
                      {isEvidenceLoading ? (
                        Array.from({ length: 3 }).map((_, idx) => (
                          <div key={idx} className="p-4 rounded-xl border border-white/5 bg-white/[0.01] animate-pulse">
                            <div className="h-4 w-3/4 bg-white/10 rounded mb-2"></div>
                          </div>
                        ))
                      ) : filteredSuppliers.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                          <p className="text-sm">No suppliers found.</p>
                        </div>
                      ) : (
                        filteredSuppliers.map((name) => (
                          <div
                            key={name}
                            onClick={() => {
                              setSelectedSupplierName(name);
                              setSelectedEvidence(null);
                            }}
                            className="p-4 rounded-xl border border-white/5 bg-white/[0.01] hover:border-white/15 hover:bg-white/[0.02] transition-all duration-300 cursor-pointer relative group overflow-hidden"
                          >
                            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <h4 className="font-semibold text-sm text-white group-hover:text-emerald-400 transition-colors">
                              {name}
                            </h4>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    {/* Supplier selected: show their files */}
                    <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/5">
                      <button
                        onClick={() => {
                          setSelectedSupplierName("");
                          setSupplierSearchQuery("");
                          setSelectedEvidence(null);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/10 transition-all cursor-pointer active:scale-95 shrink-0"
                      >
                        <IconChevronLeft className="h-4 w-4" />
                        Back to Suppliers
                      </button>
                    </div>
                    <div className="flex-1 flex flex-col">
                      <h3 className="text-sm font-bold text-white mb-1 truncate">
                        Supplier: <span className="text-emerald-400">{selectedSupplierName}</span>
                      </h3>
                      <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-4 mt-2 flex items-center gap-1.5">
                        <IconFiles className="h-4 w-4 text-emerald-400" />
                        Available Certificates ({supplierFiles.length})
                      </h4>
                      <div className="flex-1 overflow-y-auto space-y-3 max-h-[420px] pr-2">
                        {supplierFiles.length === 0 ? (
                          <p className="text-xs text-gray-500 italic">No certificates recorded for this supplier.</p>
                        ) : (
                          (supplierFiles as any[]).map((ev) => {
                            const isSelected = selectedEvidence?.audit_id === ev.audit_id && selectedEvidence?.filename === ev.filename;
                            return (
                              <div
                                key={`${ev.audit_id}-${ev.filename}`}
                                onClick={() => handleSelectEvidence(ev)}
                                className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer relative group overflow-hidden ${isSelected
                                  ? "bg-white/[0.03] border-emerald-500/20 glow-success"
                                  : "bg-white/[0.01] border-white/15 hover:border-white/20 hover:bg-white/[0.02]"
                                  }`}
                              >
                                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <div className="flex justify-between items-start mb-1.5">
                                  <p className="text-xs font-semibold text-white truncate pr-2">{ev.filename}</p>
                                </div>
                                <div className="text-[10px] text-gray-500 font-medium truncate">
                                  {cleanQuestionLabel(ev.ariba_question_label)}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* Right Column: Empty state */}
            <section className="lg:col-span-8 flex flex-col double-bezel">
              <div className="double-bezel-inner flex-1 flex flex-col h-full items-center justify-center text-center p-8">
                <div className="h-14 w-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 mb-4 animate-pulse">
                  <IconEdit className="h-6 w-6" />
                </div>
                <h3 className="text-md font-semibold text-white">Select a certificate</h3>
                <p className="text-sm text-gray-500 max-w-xs mt-1">
                  Select a supplier name on the left and pick one of their certificates to verify or edit raw OCR details.
                </p>
              </div>
            </section>
          </div>
        )
      ) : (
        /* ==================== COST ANALYTICS TAB ==================== */
        <div className="flex-1 flex flex-col gap-8 min-h-[600px]">
          {/* KPI Dashboard Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="double-bezel">
              <div className="double-bezel-inner text-center py-6">
                <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider block mb-1">Total API Spending</span>
                <h3 className="text-2xl font-black text-white tracking-tight tabular-nums">RM{totalCost.toFixed(4)}</h3>
                <span className="text-[10px] text-gray-500 mt-1 block font-medium">Accumulated sum of all runs</span>
              </div>
            </div>

            <div className="double-bezel">
              <div className="double-bezel-inner text-center py-6">
                <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider block mb-1">Ingested Documents</span>
                <h3 className="text-2xl font-black text-white tracking-tight tabular-nums">{evidenceLogs.length} Files</h3>
                <span className="text-[10px] text-gray-500 mt-1 block font-medium">Successfully completed extractions</span>
              </div>
            </div>

            <div className="double-bezel">
              <div className="double-bezel-inner text-center py-6">
                <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider block mb-1">Average Cost per Document</span>
                <h3 className="text-2xl font-black text-white tracking-tight tabular-nums">RM{avgCost.toFixed(4)}</h3>
                {/* <span className="text-[10px] text-gray-500 mt-1 block font-medium">Based on gemini-2.5-flash-lite pricing</span> */}
              </div>
            </div>
          </div>

          {/* Supplier Spend breakdown listing */}
          <div className="double-bezel flex-1">
            <div className="double-bezel-inner h-full flex flex-col">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-6">Spend breakdown by supplier</h3>

              <div className="overflow-x-auto flex-1">
                <table className="min-w-full text-left text-xs font-sans text-gray-300">
                  <thead>
                    <tr className="border-b border-white/5 font-bold text-gray-500">
                      <th className="py-3 px-4 uppercase tracking-wider text-[10px]">Supplier Name</th>
                      <th className="py-3 px-4 text-center uppercase tracking-wider text-[10px]">Certificates Audited</th>
                      <th className="py-3 px-4 text-right uppercase tracking-wider text-[10px]">Accumulated Spend (RM)</th>
                      {/* <th className="py-3 px-4 text-right w-56 uppercase tracking-wider text-[10px]">Visual Spend Proportion</th> */}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {isEvidenceLoading ? (
                      Array.from({ length: 3 }).map((_, idx) => (
                        <tr key={idx} className="animate-pulse">
                          <td className="py-4 px-4 h-8 bg-white/5 rounded-lg mb-2"></td>
                          <td className="py-4 px-4 h-8 bg-white/5 rounded-lg mb-2 text-center"></td>
                          <td className="py-4 px-4 h-8 bg-white/5 rounded-lg mb-2 text-right"></td>
                          <td className="py-4 px-4 h-8 bg-white/5 rounded-lg mb-2"></td>
                        </tr>
                      ))
                    ) : supplierCosts.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-12 text-gray-500 italic">No supplier cost metrics logged yet.</td>
                      </tr>
                    ) : (
                      supplierCosts.map((sc) => {
                        const highestSpend = supplierCosts[0]?.cost || 1.0;
                        const percentageOfHighest = (sc.cost / highestSpend) * 100;
                        return (
                          <tr key={sc.name} className="hover:bg-white/[0.01] transition-colors duration-300">
                            <td className="py-3 px-4 font-semibold text-white">{sc.name}</td>
                            <td className="py-3 px-4 text-center text-gray-300 font-medium tabular-nums">{sc.count}</td>
                            <td className="py-3 px-4 text-right font-mono font-semibold text-white tabular-nums">RM{sc.cost.toFixed(4)}</td>
                            {/* <td className="py-3 px-4 text-right">
                              <div className="w-full flex items-center justify-end gap-2.5">
                                <div className="w-32 bg-white/5 h-2 rounded-full overflow-hidden border border-white/5 relative">
                                  <div
                                    className="bg-gradient-to-r from-emerald-600 to-teal-500 h-full rounded-full"
                                    style={{ width: `${percentageOfHighest}%` }}
                                  ></div>
                                </div>
                                <span className="text-[10px] text-gray-500 font-mono w-8 text-left tabular-nums">{percentageOfHighest.toFixed(0)}%</span>
                              </div>
                            </td> */}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Screenshot Lightbox Modal ── */}
      {selectedScreenshot && (
        <div
          onClick={() => setSelectedScreenshot(null)}
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 cursor-zoom-out animate-fade-in"
        >
          <div className="relative max-w-5xl max-h-[90vh] overflow-auto rounded-xl border border-white/10 bg-black shadow-2xl">
            <img
              src={selectedScreenshot}
              alt="Expanded evidence"
              className="max-w-full h-auto object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
