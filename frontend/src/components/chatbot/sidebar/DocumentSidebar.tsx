"use client";

import {
  IconFiles,
  IconFolderPlus,
  IconRefresh,
  IconSearch,
  IconLoader2,
  IconChevronDown,
  IconChevronRight,
  IconFolder,
  IconFileText,
} from "@tabler/icons-react";
import type { DocumentSummary, DocumentFolder } from "@/types";

interface DocumentSidebarProps {
  systemDocs: DocumentSummary[];
  folders: DocumentFolder[];
  loadingDocs: boolean;
  docFilter: string;
  onFilterChange: (query: string) => void;
  expandedFolders: Record<string, boolean>;
  onToggleFolderExpand: (folderName: string) => void;
  folderGroupedDocs: Record<string, DocumentSummary[]>;
  onCreateFolderClick: () => void;
  onRefreshDocs: () => void;
  onSelectDoc: (doc: DocumentSummary) => void;
  onMoveDoc: (docId: string, folderId: string) => void;
}

export default function DocumentSidebar({
  systemDocs,
  folders,
  loadingDocs,
  docFilter,
  onFilterChange,
  expandedFolders,
  onToggleFolderExpand,
  folderGroupedDocs,
  onCreateFolderClick,
  onRefreshDocs,
  onSelectDoc,
  onMoveDoc,
}: DocumentSidebarProps) {
  return (
    <>
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-[var(--accent-primary-soft)] border border-[var(--accent-primary-border)] text-[var(--accent-primary-text)] shrink-0">
            <IconFiles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-sans text-xs font-bold text-[var(--heading-color)] truncate">
              System Sources
            </h3>
            <p className="text-[10px] text-[var(--text-tertiary)] font-mono">
              {systemDocs.length} doc{systemDocs.length === 1 ? "" : "s"} across {folders.length} folder
              {folders.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onCreateFolderClick}
            className="p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
            title="Create New Folder"
          >
            <IconFolderPlus className="w-3.5 h-3.5 text-[var(--accent-primary-text)]" />
          </button>
          <button
            onClick={onRefreshDocs}
            disabled={loadingDocs}
            className="p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer disabled:opacity-40"
            title="Refresh sources list"
          >
            <IconRefresh className={`w-3.5 h-3.5 ${loadingDocs ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Filter Search Input */}
      <div className="p-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-input)]/40 shrink-0">
        <div className="relative">
          <IconSearch className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={docFilter}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder="Search sources…"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--heading-color)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--accent-primary-border)]"
          />
        </div>
      </div>

      {/* Folder Grouped Documents List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {loadingDocs ? (
          <div className="py-12 text-center text-xs text-[var(--text-tertiary)] flex flex-col items-center gap-2">
            <IconLoader2 className="w-5 h-5 animate-spin text-[var(--accent-primary-text)]" />
            <span>Loading system sources…</span>
          </div>
        ) : Object.keys(folderGroupedDocs).length === 0 ? (
          <div className="py-12 text-center text-xs text-[var(--text-tertiary)] px-4">
            No system sources found.
          </div>
        ) : (
          Object.entries(folderGroupedDocs).map(([fName, docsInFolder]) => {
            const isExpanded = expandedFolders[fName] !== false;

            return (
              <div
                key={fName}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 overflow-hidden"
              >
                {/* Folder Header */}
                <div
                  onClick={() => onToggleFolderExpand(fName)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onToggleFolderExpand(fName);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-[var(--bg-surface)] hover:bg-[var(--accent-primary-soft)]/40 active:scale-[0.99] transition-all cursor-pointer select-none group border-b border-[var(--border-subtle)]"
                >
                  <div className="flex items-center gap-2 min-w-0 pointer-events-none">
                    {isExpanded ? (
                      <IconChevronDown className="w-4 h-4 text-[var(--accent-primary-text)] shrink-0 transition-transform" />
                    ) : (
                      <IconChevronRight className="w-4 h-4 text-[var(--text-tertiary)] group-hover:text-[var(--accent-primary-text)] shrink-0 transition-transform" />
                    )}
                    <IconFolder className="w-4 h-4 text-[var(--accent-primary-text)] shrink-0" />
                    <span className="font-sans text-xs font-bold text-[var(--heading-color)] truncate">
                      {fName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 pointer-events-none">
                    <span className="font-mono bg-[var(--bg-input)] px-2 py-0.5 rounded-full text-[10px] font-bold text-[var(--text-tertiary)] group-hover:text-[var(--accent-primary-text)] transition-colors">
                      {docsInFolder.length}
                    </span>
                  </div>
                </div>

                {/* Document List inside Folder */}
                {isExpanded && (
                  <div className="p-1.5 space-y-1 bg-[var(--bg-card)]/50">
                    {docsInFolder.length === 0 ? (
                      <p className="py-3 text-center text-[10px] text-[var(--text-tertiary)] italic">
                        Empty folder. Upload or move files here.
                      </p>
                    ) : (
                      docsInFolder.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex flex-col gap-1.5 p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 hover:border-[var(--accent-primary-border)] hover:bg-[var(--accent-primary-soft)]/40 transition-all group"
                        >
                          <button
                            onClick={() => onSelectDoc(doc)}
                            className="flex items-start gap-2 text-left cursor-pointer w-full"
                          >
                            <IconFileText className="w-4 h-4 text-[var(--accent-primary-text)] shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <h4 className="font-semibold text-xs text-[var(--heading-color)] line-clamp-2 leading-snug group-hover:text-[var(--accent-primary-text)] transition-colors">
                                {doc.title}
                              </h4>
                              <div className="flex items-center justify-between gap-1 mt-1 text-[10px] text-[var(--text-tertiary)]">
                                <span className="font-mono bg-[var(--bg-input)] px-1.5 py-0.5 rounded text-[9px] font-bold">
                                  {doc.page_count ?? 1} page{doc.page_count === 1 ? "" : "s"}
                                </span>
                              </div>
                            </div>
                          </button>

                          {/* Inline Move Folder Selector */}
                          <div className="flex items-center justify-between gap-1 pt-1 border-t border-[var(--border-subtle)]/60 text-[10px]">
                            <span className="text-[9px] text-[var(--text-tertiary)]">Folder:</span>
                            {(() => {
                              const generalFolder = folders.find((f) => f.name.toLowerCase() === "general");
                              const hasGeneralInDb = !!generalFolder;
                              const selectedValue = doc.folder_id || (generalFolder ? generalFolder.id : "");

                              return (
                                <select
                                  value={selectedValue}
                                  onChange={(e) => onMoveDoc(doc.id, e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="px-1.5 py-0.5 rounded bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[10px] font-medium text-[var(--heading-color)] outline-none cursor-pointer focus:border-[var(--accent-primary-border)]"
                                >
                                  {!hasGeneralInDb && <option value="">General</option>}
                                  {folders.map((f) => (
                                    <option key={f.id} value={f.id}>
                                      {f.name}
                                    </option>
                                  ))}
                                </select>
                              );
                            })()}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
