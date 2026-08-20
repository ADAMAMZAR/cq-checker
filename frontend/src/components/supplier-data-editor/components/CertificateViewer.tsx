"use client";

import { IconArrowUpRight, IconFiles, IconDownload } from "@tabler/icons-react";
import { buildFileUrl } from "@/lib/api";
import type { CertificateViewerProps } from "../types";

export default function CertificateViewer({ evidence }: CertificateViewerProps) {
  const fileUrl = evidence.file_url;
  const proxyUrl = fileUrl ? buildFileUrl(fileUrl) : null;
  const ct = (evidence.file_content_type || "").toLowerCase();

  if (!fileUrl) {
    return (
      <div className="flex items-center justify-center h-full text-[10px] text-[var(--text-tertiary)]">
        File not available (no stored file URL)
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-between items-center mb-4 pb-3 border-b border-[var(--border-subtle)] shrink-0">
        <h3 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
          Certificate Document
        </h3>
        <a
          href={proxyUrl ?? ""}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-visible)] text-[10px] text-[var(--text-secondary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-surface-hover)] transition-all duration-200 cursor-pointer active:scale-95"
        >
          <IconArrowUpRight className="h-3.5 w-3.5" />
          Open in Tab
        </a>
      </div>

      {ct.includes("pdf") ? (
        <iframe
          src={`${proxyUrl}#toolbar=0`}
          title="Certificate PDF"
          className="flex-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] min-h-[420px] lg:min-h-[700px]"
        />
      ) : ct.startsWith("image/") ? (
        <div className="flex-1 flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] overflow-hidden min-h-[420px] lg:min-h-[700px]">
          <img
            src={`${fileUrl}#toolbar=0`}
            alt="Certificate document"
            loading="lazy"
            decoding="async"
            className="max-w-full max-h-full object-contain"
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] gap-4 min-h-[420px] lg:min-h-[700px]">
          <div className="h-14 w-14 rounded-full bg-[var(--bg-surface)] border border-[var(--border-visible)] flex items-center justify-center text-[var(--text-tertiary)]">
            <IconFiles className="h-7 w-7" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-[var(--heading-color)]">
              Preview unavailable for this format
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              Download file to view the content details.
            </p>
          </div>
          <a
            href={proxyUrl ?? ""}
            download
            className="flex items-center gap-1.5 px-4.5 py-2 rounded-xl bg-[var(--accent-success-strong)] text-xs font-semibold text-[var(--heading-color)] hover:bg-[var(--accent-success)] transition-all duration-300 cursor-pointer active:scale-95 glow-success mt-2"
          >
            <IconDownload className="h-4 w-4" />
            Open / Download File
          </a>
        </div>
      )}
    </>
  );
}
