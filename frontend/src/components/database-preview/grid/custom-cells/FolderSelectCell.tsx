"use client";

import type { DocumentFolder } from "@/types";

interface FolderSelectCellProps {
  cell: string;
  docId: string | null;
  updatingCell: boolean;
  folders: DocumentFolder[];
  onFolderChange: (docId: string, folderId: string) => void;
  normCol: string;
}

export default function FolderSelectCell({
  cell,
  docId,
  updatingCell,
  folders,
  onFolderChange,
  normCol,
}: FolderSelectCellProps) {
  const generalFolder = folders.find((f) => f.name.toLowerCase() === "general");
  const hasGeneralInDb = !!generalFolder;
  const currentFolderId =
    normCol === "folder_id"
      ? cell
      : folders.find((f) => f.name === cell)?.id || (generalFolder ? generalFolder.id : "");

  return (
    <td className="py-1.5 px-2 align-middle border-b border-[var(--border-subtle)]">
      <select
        value={currentFolderId || ""}
        disabled={updatingCell || !docId}
        onChange={(e) => {
          if (docId) onFolderChange(docId, e.target.value);
        }}
        className="px-2.5 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary-border)] text-xs font-semibold text-[var(--heading-color)] outline-none cursor-pointer focus:border-[var(--accent-primary-border)] transition-all disabled:opacity-50"
      >
        {!hasGeneralInDb && <option value="">📁 General</option>}
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            📁 {f.name} ({f.document_count})
          </option>
        ))}
      </select>
    </td>
  );
}
