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
  IconArrowUpRight
} from "@tabler/icons-react";

interface AuditLog {
  timestamp: string;
  supplier_name: string;
  workspace_title: string;
  cert_type: string;
  filename: string;
  result: string;
  expiration_date: string;
  suggested_comment: string;
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

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.supplier_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          log.cert_type.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || 
                          (statusFilter === "MATCH" && log.result.toLowerCase() === "match") ||
                          (statusFilter === "MISMATCH" && log.result.toLowerCase() === "mismatch");
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex-1 flex flex-col max-w-[1600px] w-full mx-auto p-4 md:p-8">
      {/* ── Header / Top Navigation ── */}
      <header className="flex justify-between items-center mb-8 pb-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center glow-success">
            <IconDatabase className="text-white h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">GPO Automatic Certificate Auditor</h1>
            <p className="text-xs text-gray-400">Compliance Verification Logs & AI-Auditor Hub</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Connection status dot */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium">
            <span className={`h-2 w-2 rounded-full ${error ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`}></span>
            {error ? "Database Offline" : "Database Live"}
          </div>
          
          <button 
            onClick={fetchLogs} 
            className="flex items-center justify-center p-2 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-all cursor-pointer active:scale-95"
            title="Refresh logs"
          >
            <IconLoader2 className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* ── Dashboard Content ── */}
      {error && logs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center double-bezel max-w-lg mx-auto my-12">
          <div className="double-bezel-inner flex flex-col items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500 glow-error">
              <IconAlertTriangle className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">Database connection failure</h3>
            <p className="text-sm text-gray-400 max-w-sm">
              We couldn't connect to the local Google Sheets database server. Make sure your FastAPI backend API is running at <code className="px-1.5 py-0.5 rounded bg-black/40 text-rose-400">http://127.0.0.1:8000</code>.
            </p>
            <button 
              onClick={fetchLogs} 
              className="mt-2 px-5 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all cursor-pointer active:scale-98"
            >
              Retry Connection
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          
          {/* ── Left Column: Audit Log Registry (Grid 5 spans) ── */}
          <section className="lg:col-span-5 flex flex-col min-h-[600px] double-bezel">
            <div className="double-bezel-inner flex-1 flex flex-col h-full">
              
              {/* Search and Filters */}
              <div className="mb-6 space-y-4">
                <div className="relative">
                  <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 h-4.5 w-4.5" />
                  <input 
                    type="text" 
                    placeholder="Search supplier or certificate..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-black/40 border border-white/5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 transition-all font-sans"
                  />
                </div>

                {/* Filters Row */}
                <div className="flex gap-2">
                  {(["ALL", "MATCH", "MISMATCH"] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setStatusFilter(f)}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider transition-all cursor-pointer ${
                        statusFilter === f 
                          ? "bg-indigo-600 text-white shadow-md glow-success" 
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
                  // Skeleton loader cards
                  Array.from({ length: 4 }).map((_, idx) => (
                    <div key={idx} className="p-4 rounded-xl border border-white/5 bg-white/[0.01] animate-pulse">
                      <div className="h-4 w-3/4 bg-white/10 rounded mb-2"></div>
                      <div className="h-3 w-1/2 bg-white/10 rounded"></div>
                    </div>
                  ))
                ) : filteredLogs.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
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
                        className={`p-4 rounded-xl border transition-all cursor-pointer duration-300 relative group overflow-hidden ${
                          isSelected 
                            ? "bg-white/[0.04] border-indigo-500/40 glow-success" 
                            : "bg-white/[0.01] border-white/5 hover:border-white/15 hover:bg-white/[0.02]"
                        }`}
                      >
                        {/* Background kinetic hover line */}
                        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-indigo-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-semibold text-sm text-white group-hover:text-indigo-300 transition-colors">
                            {log.supplier_name}
                          </h4>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${
                            isMatch 
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          }`}>
                            {log.result}
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-xs text-gray-400">
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

          {/* ── Right Column: Inspect & Audit Details Pane (Grid 7 spans) ── */}
          <section className="lg:col-span-7 flex flex-col double-bezel">
            <div className="double-bezel-inner flex-1 flex flex-col h-full">
              
              {selectedLog ? (
                <div className="flex-1 flex flex-col h-full">
                  {/* Detailed Log Title */}
                  <div className="flex justify-between items-start mb-6 pb-4 border-b border-white/5">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                          Workspace Audit Record
                        </span>
                        <span className="text-[10px] text-gray-500">{selectedLog.timestamp}</span>
                      </div>
                      <h2 className="text-lg font-bold text-white leading-tight">{selectedLog.supplier_name}</h2>
                      <p className="text-xs text-gray-400 mt-0.5">{selectedLog.workspace_title}</p>
                    </div>
                    
                    {/* Status Badge */}
                    <div className="flex flex-col items-end">
                      <div className={`px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase ${
                        selectedLog.result.toLowerCase() === "match" 
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                          : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      }`}>
                        {selectedLog.result}
                      </div>
                      <span className="text-[10px] text-gray-400 mt-1">Expiry: {selectedLog.expiration_date}</span>
                    </div>
                  </div>

                  {/* Dynamic Tabs header */}
                  <div className="flex border-b border-white/5 gap-4 mb-6">
                    <button 
                      onClick={() => setActiveTab("comparison")} 
                      className={`pb-3 text-sm font-semibold relative tracking-wide cursor-pointer transition-all ${
                        activeTab === "comparison" ? "text-indigo-400" : "text-gray-400 hover:text-gray-200"
                      }`}
                    >
                      {activeTab === "comparison" && (
                        <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-500 rounded-full"></span>
                      )}
                      Comparison Analysis
                    </button>
                    <button 
                      onClick={() => setActiveTab("assets")} 
                      className={`pb-3 text-sm font-semibold relative tracking-wide cursor-pointer transition-all flex items-center gap-2 ${
                        activeTab === "assets" ? "text-indigo-400" : "text-gray-400 hover:text-gray-200"
                      }`}
                    >
                      {activeTab === "assets" && (
                        <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-500 rounded-full"></span>
                      )}
                      Files & Screenshot Evidence
                      {assets.screenshots.length > 0 && (
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400"></span>
                      )}
                    </button>
                  </div>

                  {/* ── TAB 1: Comparison Analysis ── */}
                  {activeTab === "comparison" && (
                    <div className="flex-1 flex flex-col gap-6">
                      
                      {/* Suggested Copy Comment block */}
                      <div className="p-4 rounded-xl border border-white/5 bg-black/40 relative">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Suggested Audit Feedback</span>
                          <button
                            onClick={() => handleCopyComment(getCommentAndTable(selectedLog.suggested_comment).comment)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-xs font-semibold text-gray-300 transition-all cursor-pointer active:scale-95"
                          >
                            {copied ? (
                              <>
                                <IconCheck className="h-3.5 w-3.5 text-emerald-400" />
                                <span className="text-emerald-400">Copied</span>
                              </>
                            ) : (
                              <>
                                <IconCopy className="h-3.5 w-3.5" />
                                <span>Copy Comment</span>
                              </>
                            )}
                          </button>
                        </div>
                        <p className="text-sm text-gray-200 leading-relaxed italic">
                          "{getCommentAndTable(selectedLog.suggested_comment).comment}"
                        </p>
                      </div>

                      {/* Comparison Table */}
                      <div className="flex-1">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Field Validation Table</h4>
                        
                        {getCommentAndTable(selectedLog.suggested_comment).table ? (
                          <div className="overflow-x-auto rounded-xl border border-white/5 bg-black/20">
                            <table className="w-full text-left text-sm border-collapse">
                              <thead>
                                <tr className="border-b border-white/5 bg-white/[0.02]">
                                  {getCommentAndTable(selectedLog.suggested_comment).table?.headers.map((h, i) => (
                                    <th key={i} className="p-3 font-semibold text-gray-300 text-xs uppercase tracking-wider">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                {getCommentAndTable(selectedLog.suggested_comment).table?.rows.map((row, i) => (
                                  <tr key={i} className="hover:bg-white/[0.01] transition-all">
                                    {row.map((cell, cIdx) => {
                                      // Render status badge for the "Status" column
                                      const isStatusCol = cIdx === row.length - 1;
                                      const isMatch = cell.toLowerCase().includes("match") || cell.toLowerCase() === "passed" || cell.toLowerCase() === "yes";
                                      const isMismatch = cell.toLowerCase().includes("mismatch") || cell.toLowerCase() === "failed" || cell.toLowerCase() === "no";
                                      
                                      return (
                                        <td key={cIdx} className="p-3 text-gray-300">
                                          {isStatusCol ? (
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                              isMatch 
                                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                                                : isMismatch
                                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                            }`}>
                                              {cell}
                                            </span>
                                          ) : (
                                            cell
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="p-8 rounded-xl border border-dashed border-white/10 text-center text-gray-400 text-sm">
                            No structured comparison table was generated. All audit details are visible in the suggested comment.
                          </div>
                        )}
                      </div>

                    </div>
                  )}

                  {/* ── TAB 2: Files & Screenshot Evidence ── */}
                  {activeTab === "assets" && (
                    <div className="flex-1 flex flex-col gap-6 overflow-y-auto max-h-[500px]">
                      
                      {/* Documents section */}
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                          <IconFiles className="h-4 w-4 text-indigo-400" />
                          Audited Attachments ({assets.documents.length})
                        </h4>

                        {assetsLoading ? (
                          <div className="h-12 bg-white/[0.02] border border-white/5 rounded-xl animate-pulse"></div>
                        ) : assets.documents.length === 0 ? (
                          <p className="text-sm text-gray-500 italic">No certificate documents found inside the local storage path.</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {assets.documents.map((doc, idx) => (
                              <a
                                key={idx}
                                href={`http://127.0.0.1:8000${doc.url}`}
                                target="_blank"
                                rel="noreferrer"
                                className="p-3 rounded-xl border border-white/5 bg-black/40 flex items-center justify-between hover:border-indigo-500/30 hover:bg-white/[0.01] transition-all group"
                              >
                                <div className="truncate pr-4">
                                  <p className="text-xs font-medium text-white truncate">{doc.name}</p>
                                  <p className="text-[10px] text-gray-400">PDF Document</p>
                                </div>
                                <IconArrowUpRight className="h-4 w-4 text-gray-400 group-hover:text-indigo-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Screen captures section */}
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                          <IconPhoto className="h-4 w-4 text-indigo-400" />
                          Audit Validation Screen Captures ({assets.screenshots.length})
                        </h4>

                        {assetsLoading ? (
                          <div className="h-32 bg-white/[0.02] border border-white/5 rounded-xl animate-pulse"></div>
                        ) : assets.screenshots.length === 0 ? (
                          <p className="text-sm text-gray-500 italic">No evidence validation screenshots found inside the local storage path.</p>
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
                                  className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500" 
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

                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <div className="h-14 w-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 mb-4">
                    <IconFiles className="h-6 w-6" />
                  </div>
                  <h3 className="text-md font-semibold text-white">Select a supplier log</h3>
                  <p className="text-sm text-gray-400 max-w-xs mt-1">
                    Choose an entry from the registry panel to check detail comparisons, verification documents, and validation screenshots.
                  </p>
                </div>
              )}

            </div>
          </section>

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
