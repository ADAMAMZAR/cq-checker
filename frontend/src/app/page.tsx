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
  IconChevronLeft
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
  const [activeTab, setActiveTab] = useState<"comparison" | "qa_data" | "assets">("comparison");
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);

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
    expirationDate: "",
    effectiveDate: "",
    certificateLocation: ""
  });

  const [initialFields, setInitialFields] = useState<Record<string, string>>({
    certificateOwnerName: "",
    issuerName: "",
    certificateType: "",
    certificateNumber: "",
    expirationDate: "",
    effectiveDate: "",
    certificateLocation: ""
  });

  const [isSavingForm, setIsSavingForm] = useState(false);
  const [formSuccessMessage, setFormSuccessMessage] = useState<string | null>(null);
  const [formErrorMessage, setFormErrorMessage] = useState<string | null>(null);

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
        expirationDate: "",
        effectiveDate: "",
        certificateLocation: ""
      };
    }
    setFormFields(targetFields);
    setInitialFields(targetFields);
  };

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

      setFormSuccessMessage("Successfully saved changes!");
      setInitialFields(formFields);

      // Refresh local logs
      await fetchEvidence();

      // Update selected evidence in UI state
      const updatedEvidence = {
        ...selectedEvidence,
        gemini_extracted_supplier_name: formFields.certificateOwnerName,
        gemini_extracted_metadata: JSON.stringify(formFields)
      };
      setSelectedEvidence(updatedEvidence);
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
  const getCommentAndTable = (fullComment: string) => {
    if (!fullComment) return { comment: "", table: null };
    const parts = fullComment.split(" | Comparison: ");
    const comment = parts[0];
    const rawTable = parts[1] || "";

    // Parse markdown table to structured object
    if (!rawTable || !rawTable.includes("|")) return { comment, table: null };

    const lines = rawTable.split("\n").map(l => l.trim()).filter(l => l.startsWith("|"));
    if (lines.length < 2) return { comment, table: null };

    const headers = lines[0].split("|").map(h => h.trim()).filter(h => h !== "");
    const rows = lines.slice(2).map(line => {
      return line.split("|").map(cell => cell.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
    });

    return { comment, table: { headers, rows } };
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

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.supplier_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.cert_type.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "ALL" ||
      (statusFilter === "MATCH" && log.result.toLowerCase() === "match") ||
      (statusFilter === "MISMATCH" && log.result.toLowerCase() === "mismatch");
    return matchesSearch && matchesStatus;
  });

  // Filter supplier list in editor tab
  const uniqueSuppliers = Array.from(new Set(evidenceLogs.map(e => e.supplier_name)));
  const filteredSuppliers = uniqueSuppliers.filter(name =>
    name.toLowerCase().includes(supplierSearchQuery.toLowerCase())
  );

  const supplierFiles = selectedSupplierName
    ? evidenceLogs.filter(e => e.supplier_name === selectedSupplierName)
    : [];

  return (
    <div className="flex-1 flex flex-col w-full p-4 md:p-8">
      {/* ── Header / Top Navigation ── */}
      <header className="flex justify-between items-center mb-6 pb-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/[0.02] border border-white/10 flex items-center justify-center">
            <IconDatabase className="text-emerald-400 h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">GPO Automatic Certificate Auditor</h1>
            <p className="text-xs text-gray-500">Compliance Verification Logs & AI-Auditor Hub</p>
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
          {/* Left Column: Audit Log Registry (Grid 5 spans) */}
          <section className="lg:col-span-5 flex flex-col min-h-[600px] double-bezel">
            <div className="double-bezel-inner flex-1 flex flex-col h-full">
              {/* Search and Filters */}
              <div className="mb-6 space-y-4">
                <div className="relative">
                  <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 h-4.5 w-4.5" />
                  <input
                    type="text"
                    placeholder="Search supplier or certificate..."
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
                  filteredLogs.map((log) => {
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
                            <div className="flex items-center gap-1.5 mb-1 text-[9px] text-gray-500 font-mono tracking-wider">
                              <span>SUPP_{String(log.supplier_id).padStart(4, '0')}</span>
                              <span>•</span>
                              <span>{log.audit_id}</span>
                            </div>
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
                        <div className="flex justify-between items-center text-xs text-gray-500 font-medium">
                          <span>{log.cert_type}</span>
                          <span>{log.timestamp.split(" ")[0]}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>

          {/* Right Column: Inspect & Audit Details Pane (Grid 7 spans) */}
          <section className="lg:col-span-7 flex flex-col double-bezel">
            <div className="double-bezel-inner flex-1 flex flex-col h-full">
              {selectedLog ? (
                <div className="flex-1 flex flex-col h-full">
                  <div className="flex justify-between items-start mb-6 pb-4 border-b border-white/5">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/[0.04] border border-emerald-500/15 px-2 py-0.5 rounded-full">
                          Workspace Audit Record
                        </span>
                        <span className="text-[10px] text-gray-500 font-medium">{selectedLog.timestamp}</span>
                      </div>
                      <h2 className="text-xl font-bold text-white tracking-tight">{selectedLog.supplier_name}</h2>
                      <p className="text-xs text-gray-500 mt-0.5">Audit run ID: <code className="px-1 rounded bg-black/45 text-gray-400 font-mono text-[10px]">{selectedLog.audit_id}</code></p>
                    </div>
                    {(selectedLog.total_run_cost_myr || selectedLog.total_run_cost_usd) ? (
                      <div className="text-right">
                        <p className="text-[10px] uppercase font-bold tracking-wider text-gray-500">Execution Cost</p>
                        <p className="text-sm font-bold text-white mt-0.5 tabular-nums">
                          RM{(selectedLog.total_run_cost_myr || (selectedLog.total_run_cost_usd ? selectedLog.total_run_cost_usd * 4.70 : 0.0)).toFixed(4)} MYR
                        </p>
                      </div>
                    ) : null}
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
                      Comparison Results
                    </button>
                    <button
                      onClick={() => setActiveTab("qa_data")}
                      className={`pb-2.5 px-0.5 text-xs font-semibold tracking-wider uppercase border-b-2 transition-all duration-300 ease-out cursor-pointer active:scale-[0.97] ${activeTab === "qa_data"
                        ? "border-emerald-500 text-white font-bold"
                        : "border-transparent text-gray-500 hover:text-gray-400"
                        }`}
                    >
                      Scraped Questionnaire Q&A
                    </button>
                    <button
                      onClick={() => setActiveTab("assets")}
                      className={`pb-2.5 px-0.5 text-xs font-semibold tracking-wider uppercase border-b-2 transition-all duration-300 ease-out cursor-pointer active:scale-[0.97] ${activeTab === "assets"
                        ? "border-emerald-500 text-white font-bold"
                        : "border-transparent text-gray-500 hover:text-gray-400"
                        }`}
                    >
                      Audit evidence files
                    </button>
                  </div>

                  {/* TAB Content */}
                  {activeTab === "comparison" && (
                    <div className="flex-1 flex flex-col gap-6 overflow-y-auto max-h-[500px] pr-2">
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
                        const { comment, table } = getCommentAndTable(selectedLog.suggested_comment);
                        return (
                          <>
                            <div className="p-4 rounded-xl border border-white/5 bg-black/40 relative">
                              <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Auditor suggested comment</h4>
                              <p className="text-sm text-gray-300 italic font-medium pr-10 leading-relaxed">
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

                            {table && (
                              <div className="p-4 rounded-xl border border-white/5 bg-black/40 overflow-hidden">
                                <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">QA Form vs Certificate Comparison</h4>
                                <div className="overflow-x-auto">
                                  <table className="min-w-full text-left text-xs font-sans text-gray-300">
                                    <thead>
                                      <tr className="border-b border-white/5 font-bold text-gray-400">
                                        {table.headers.map((h, i) => (
                                          <th key={i} className="py-2.5 px-3 uppercase tracking-wider text-[10px]">{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                      {table.rows.map((row, rIdx) => (
                                        <tr key={rIdx} className="hover:bg-white/[0.01]">
                                          {row.map((cell, cIdx) => {
                                            const isStatusCell = cIdx === row.length - 1;
                                            const cleanCell = cell.trim();
                                            const isMatch = cleanCell.toLowerCase() === "match";
                                            const isMismatch = cleanCell.toLowerCase() === "mismatch";
                                            return (
                                              <td key={cIdx} className="py-2.5 px-3 text-gray-300 font-medium">
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
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {activeTab === "assets" && (
                    <div className="flex-1 flex flex-col gap-6 overflow-y-auto max-h-[500px] pr-2">
                      <div>
                        <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <IconFiles className="h-4.5 w-4.5 text-emerald-400" />
                          Audited Attachments ({assets.documents.length})
                        </h4>
                        {assetsLoading ? (
                          <div className="h-12 bg-white/[0.02] border border-white/5 rounded-xl animate-pulse"></div>
                        ) : assets.documents.length === 0 ? (
                          <p className="text-sm text-gray-500 italic">No certificate documents found inside local storage path.</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {assets.documents.map((doc, idx) => {
                              let geminiData = null;
                              let docUsage = null;
                              try {
                                const parsed = JSON.parse(selectedLog.compiled_extracted_data || '[]');
                                const match = parsed.find((item: any) =>
                                  item.filename.toLowerCase() === doc.name.toLowerCase() ||
                                  doc.name.toLowerCase().includes(item.filename.toLowerCase()) ||
                                  item.filename.toLowerCase().includes(doc.name.toLowerCase())
                                );
                                if (match) {
                                  geminiData = match.extracted_data;
                                  docUsage = {
                                    input_tokens: match.input_tokens || 0,
                                    output_tokens: match.output_tokens || 0,
                                    cost_usd: match.cost_usd || 0.0
                                  };
                                }
                              } catch (e) {
                                console.error(e);
                              }

                              return (
                                <div key={idx} className="p-4 rounded-xl border border-white/5 bg-black/40 flex flex-col gap-3 hover:border-emerald-500/20 hover:bg-white/[0.01] transition-all duration-300 group">
                                  <div className="flex justify-between items-start">
                                    <div className="truncate pr-4">
                                      <p className="text-xs font-semibold text-white truncate">{doc.name}</p>
                                      <p className="text-[10px] text-gray-500 font-medium">PDF Document</p>
                                    </div>
                                    <a
                                      href={`http://127.0.0.1:8000${doc.url}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="p-1.5 rounded bg-white/5 hover:bg-white/10 transition-all duration-300 cursor-pointer active:scale-95"
                                      title="Open document"
                                    >
                                      <IconArrowUpRight className="h-4 w-4 text-gray-400 group-hover:text-emerald-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                                    </a>
                                  </div>

                                  {geminiData && (
                                    <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5 text-[11px] space-y-1.5 font-mono text-gray-400">
                                      <div className="flex justify-between gap-2">
                                        <span>Extracted Supplier:</span>
                                        <span className="text-white truncate max-w-[130px] font-sans">{geminiData.certificateOwnerName || 'N/A'}</span>
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
                                        <span>Expiration Date:</span>
                                        <span className="text-white">{geminiData.expirationDate || 'N/A'}</span>
                                      </div>
                                      {docUsage && docUsage.cost_usd > 0 && (
                                        <>
                                          <div className="flex justify-between border-t border-white/5 pt-1.5 mt-1.5">
                                            <span>Tokens:</span>
                                            <span className="text-white tabular-nums">{docUsage.input_tokens + docUsage.output_tokens} (In: {docUsage.input_tokens} | Out: {docUsage.output_tokens})</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span>Est. Cost:</span>
                                            <span className="text-white tabular-nums">RM{(docUsage.cost_myr || (docUsage.cost_usd ? docUsage.cost_usd * 4.70 : 0.0)).toFixed(4)} MYR</span>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div>
                        <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <IconPhoto className="h-4.5 w-4.5 text-emerald-400" />
                          Audit Validation Screen Captures ({assets.screenshots.length})
                        </h4>
                        {assetsLoading ? (
                          <div className="h-32 bg-white/[0.02] border border-white/5 rounded-xl animate-pulse"></div>
                        ) : assets.screenshots.length === 0 ? (
                          <p className="text-sm text-gray-500 italic">No evidence validation screenshots found inside local storage path.</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {assets.screenshots.map((shot, idx) => (
                              <div
                                key={idx}
                                onClick={() => setSelectedScreenshot(`http://127.0.0.1:8000${shot}`)}
                                className="border border-white/5 rounded-xl bg-black/40 overflow-hidden relative aspect-video group cursor-zoom-in"
                              >
                                <img
                                  src={`http://127.0.0.1:8000${shot}`}
                                  alt="Audit verification capture"
                                  className="w-full h-full object-cover group-hover:scale-102 transition-all duration-500"
                                />
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-300">
                                  <span className="text-xs font-semibold text-white tracking-wide flex items-center gap-1">
                                    Expand Evidence Screenshot
                                    <IconExternalLink className="h-3.5 w-3.5" />
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === "qa_data" && (
                    <div className="flex-1 flex flex-col gap-4 overflow-y-auto max-h-[500px] pr-2">
                      {(() => {
                        try {
                          const parsedQA = JSON.parse(selectedLog.complete_qa_data_dump || "[]");
                          if (!Array.isArray(parsedQA) || parsedQA.length === 0) {
                            return <p className="text-sm text-gray-500 italic">No scraped Q&A form data recorded for this run.</p>;
                          }
                          return parsedQA.map((block: any, bIdx: number) => (
                            <div key={bIdx} className="p-4 rounded-xl border border-white/5 bg-black/40 space-y-3">
                              <div className="flex justify-between items-start border-b border-white/5 pb-2 gap-4">
                                <div>
                                  {block.sectionLabel && (
                                    <span className="text-[9px] uppercase font-bold text-emerald-400 tracking-wider block">
                                      {block.sectionLabel}
                                    </span>
                                  )}
                                  <h5 className="text-xs font-semibold text-white mt-0.5 leading-tight">{block.questionLabel}</h5>
                                </div>
                                {block.attachedFile && (
                                  <span className="text-[9px] px-2 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-gray-400 shrink-0">
                                    Attachment: {block.attachedFile}
                                  </span>
                                )}
                              </div>
                              <div className="space-y-2">
                                {block.answers && block.answers.map((ans: any, aIdx: number) => (
                                  <div key={aIdx} className="text-xs flex gap-2">
                                    <span className="text-gray-500 font-medium shrink-0">{ans.label}:</span>
                                    <span className="text-gray-300 font-medium">{ans.value}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ));
                        } catch (e) {
                          return <p className="text-sm text-rose-400 italic">Failed to parse Q&A JSON data dump.</p>;
                        }
                      })()}
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
                  <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5 shrink-0">
                    <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Certificate Document</h3>
                    <a
                      href={`http://127.0.0.1:8000/static/${selectedEvidence.supplier_name.replace(/[^a-zA-Z0-9 _-]/g, '').trim()}/${selectedEvidence.filename}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[10px] text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-200 cursor-pointer active:scale-95"
                    >
                      <IconArrowUpRight className="h-3.5 w-3.5" />
                      Open in Tab
                    </a>
                  </div>

                  {/* Adaptive file renderer */}
                  {(() => {
                    const safeName = selectedEvidence.supplier_name.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
                    const fileUrl = `http://127.0.0.1:8000/static/${safeName}/${selectedEvidence.filename}`;
                    const ct = (selectedEvidence.file_content_type || '').toLowerCase();

                    if (ct.includes('pdf')) {
                      return (
                        <iframe
                          src={fileUrl}
                          title="Certificate PDF"
                          className="flex-1 w-full rounded-xl border border-white/5 bg-black/30"
                          style={{ minHeight: '700px' }}
                        />
                      );
                    } else if (ct.startsWith('image/')) {
                      return (
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
                      );
                    } else {
                      return (
                        <div
                          className="flex-1 flex flex-col items-center justify-center rounded-xl border border-white/5 bg-black/30 gap-4"
                          style={{ minHeight: '700px' }}
                        >
                          <div className="h-14 w-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-500">
                            <IconFiles className="h-7 w-7" />
                          </div>
                          <div className="text-center">
                            <p className="text-sm text-gray-300 font-semibold">{selectedEvidence.filename}</p>
                            <p className="text-xs text-gray-600 mt-1">{ct || 'Unknown file type'}</p>
                          </div>
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600/10 border border-emerald-500/20 text-xs text-emerald-400 hover:bg-emerald-600/20 transition-all duration-200 cursor-pointer active:scale-95"
                          >
                            <IconArrowUpRight className="h-4 w-4" />
                            Open / Download File
                          </a>
                        </div>
                      );
                    }
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
            {/* Left Column: Dropdown search & file list */}
            <section className="lg:col-span-4 flex flex-col double-bezel">
              <div className="double-bezel-inner flex-1 flex flex-col h-full relative">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-4">Supplier Selector</h3>

                {/* Custom Searchable Supplier Dropdown */}
                <div className="relative mb-6">
                  <label className="text-[9px] uppercase font-bold text-emerald-400 tracking-wider block mb-1">Search Supplier Name</label>
                  <div
                    className="flex justify-between items-center w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/5 text-sm text-gray-200 focus-within:border-emerald-500/30 transition-all duration-300 cursor-pointer"
                    onClick={() => setIsSupplierDropdownOpen(!isSupplierDropdownOpen)}
                  >
                    <input
                      type="text"
                      placeholder="Search supplier..."
                      value={supplierSearchQuery}
                      onChange={(e) => {
                        setSupplierSearchQuery(e.target.value);
                        setIsSupplierDropdownOpen(true);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full bg-transparent border-none text-sm text-gray-200 focus:outline-none placeholder-gray-600 font-sans"
                    />
                    <IconChevronDown className="h-4 w-4 text-gray-500 shrink-0" />
                  </div>

                  {/* Dropdown Menu List */}
                  {isSupplierDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 z-40 max-h-52 overflow-y-auto rounded-xl border border-white/10 bg-gray-950/95 backdrop-blur-md shadow-2xl py-1">
                      {isEvidenceLoading ? (
                        <div className="px-4 py-3 text-xs text-gray-500 flex items-center gap-2">
                          <IconLoader2 className="h-3.5 w-3.5 animate-spin" /> Loading list...
                        </div>
                      ) : filteredSuppliers.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-gray-500 italic">No matching suppliers found</div>
                      ) : (
                        filteredSuppliers.map((name) => (
                          <div
                            key={name}
                            onClick={() => {
                              setSelectedSupplierName(name);
                              setSupplierSearchQuery(name);
                              setIsSupplierDropdownOpen(false);
                              setSelectedEvidence(null);
                            }}
                            className={`px-4 py-2 text-xs text-gray-300 hover:bg-white/5 cursor-pointer transition-colors ${selectedSupplierName === name ? "bg-emerald-600/10 font-medium text-emerald-400" : ""
                              }`}
                          >
                            {name}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Supplier Audited Attachments List */}
                {selectedSupplierName && (
                  <div className="flex-1 flex flex-col">
                    <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <IconFiles className="h-4 w-4 text-emerald-400" />
                      Available Certificates ({supplierFiles.length})
                    </h4>
                    <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[350px] pr-2">
                      {supplierFiles.map((ev) => {
                        const isSelected = selectedEvidence?.audit_id === ev.audit_id && selectedEvidence?.filename === ev.filename;
                        return (
                          <div
                            key={`${ev.audit_id}-${ev.filename}`}
                            onClick={() => handleSelectEvidence(ev)}
                            className={`p-3 rounded-lg border transition-all duration-300 cursor-pointer ${isSelected
                              ? "bg-white/[0.03] border-emerald-500/20 glow-success"
                              : "bg-white/[0.01] border-white/5 hover:border-white/10 hover:bg-white/[0.02]"
                              }`}
                          >
                            <p className="text-xs font-semibold text-white truncate">{ev.filename}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
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
                  Select a supplier name and pick one of their certificates on the left to verify or edit raw OCR details.
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
                <h3 className="text-2xl font-black text-white tracking-tight tabular-nums">RM{totalCost.toFixed(4)} MYR</h3>
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
                <h3 className="text-2xl font-black text-white tracking-tight tabular-nums">RM{avgCost.toFixed(4)} MYR</h3>
                <span className="text-[10px] text-gray-500 mt-1 block font-medium">Based on gemini-2.5-flash-lite pricing</span>
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
                      <th className="py-3 px-4 text-right uppercase tracking-wider text-[10px]">Accumulated Spend (MYR)</th>
                      <th className="py-3 px-4 text-right w-56 uppercase tracking-wider text-[10px]">Visual Spend Proportion</th>
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
                            <td className="py-3 px-4 text-right font-mono font-semibold text-white tabular-nums">RM{sc.cost.toFixed(4)} MYR</td>
                            <td className="py-3 px-4 text-right">
                              <div className="w-full flex items-center justify-end gap-2.5">
                                <div className="w-32 bg-white/5 h-2 rounded-full overflow-hidden border border-white/5 relative">
                                  <div
                                    className="bg-gradient-to-r from-emerald-600 to-teal-500 h-full rounded-full"
                                    style={{ width: `${percentageOfHighest}%` }}
                                  ></div>
                                </div>
                                <span className="text-[10px] text-gray-500 font-mono w-8 text-left tabular-nums">{percentageOfHighest.toFixed(0)}%</span>
                              </div>
                            </td>
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
