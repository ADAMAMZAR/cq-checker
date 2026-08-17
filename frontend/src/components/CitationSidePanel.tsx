"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
  IconChevronLeft,
  IconChevronRight,
  IconFileText,
  IconZoomIn,
  IconZoomOut,
  IconArrowLeft,
} from "@tabler/icons-react";

import MarkdownViewer from "./citation-viewers/MarkdownViewer";
import ImageViewer from "./citation-viewers/ImageViewer";

// Set worker URL matching exact react-pdf pdfjs.version
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

interface CitationSidePanelProps {
  fileUrl: string;
  documentId?: string | null;
  contentType?: string | null;
  initialPage?: number;
  snippet?: string | null;
  title?: string;
  onClose: () => void;
}

function detectFileType(fileUrl: string, contentType?: string | null): "pdf" | "image" | "text" {
  const cType = (contentType || "").toLowerCase();
  if (cType.includes("pdf")) return "pdf";
  if (cType.includes("image")) return "image";
  if (cType.includes("text") || cType.includes("word") || cType.includes("markdown")) return "text";

  const ext = fileUrl.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) return "image";
  if (["md", "markdown", "docx", "doc", "txt"].includes(ext)) return "text";

  return "pdf"; // Default fallback
}

export default memo(function CitationSidePanel({
  fileUrl,
  documentId,
  contentType,
  initialPage = 1,
  snippet,
  title,
  onClose,
}: CitationSidePanelProps) {
  const viewerType = detectFileType(fileUrl, contentType);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [width, setWidth] = useState(320);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [scale, setScale] = useState(1.0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(Math.floor(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
    setLoadError(null);
  }, []);

  const handleLoadError = useCallback(() => {
    setLoadError("Could not load this PDF (it may not be available in dev storage).");
  }, []);

  const scrollToPage = useCallback((p: number) => {
    const targetEl = pageRefs.current[p];
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
      setPageNumber(p);
    }
  }, []);

  const goTo = (n: number) => {
    if (!numPages) return;
    const valid = Math.min(Math.max(1, n), numPages);
    scrollToPage(valid);
  };

  useEffect(() => {
    if (numPages && initialPage && pageRefs.current[initialPage]) {
      const timer = setTimeout(() => {
        pageRefs.current[initialPage]?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [numPages, initialPage]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !numPages || viewerType !== "pdf") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pStr = entry.target.getAttribute("data-page-number");
            if (pStr) {
              const p = parseInt(pStr, 10);
              if (!isNaN(p)) {
                setPageNumber(p);
              }
            }
          }
        }
      },
      {
        root: container,
        rootMargin: "-20% 0px -40% 0px",
        threshold: 0.1,
      }
    );

    Object.values(pageRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [numPages, viewerType]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--bg-card)]">
      {/* Header with Back to Sources Button */}
      <header className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onClose}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary-border)] hover:bg-[var(--accent-primary-soft)] text-[11px] font-bold text-[var(--heading-color)] hover:text-[var(--accent-primary-text)] transition-all cursor-pointer shrink-0 shadow-xs"
            title="Return to System Sources list"
          >
            <IconArrowLeft className="w-3.5 h-3.5 text-[var(--accent-primary-text)]" />
            <span>Back</span>
          </button>
          <div className="min-w-0">
            <p className="text-xs font-bold text-[var(--heading-color)] truncate">
              {title || "Source Document"}
            </p>
            <p className="text-[10px] text-[var(--text-tertiary)] font-mono flex items-center gap-1">
              <span>Page {pageNumber}{numPages ? ` of ${numPages}` : ""}</span>
              <span className="uppercase text-[9px] px-1 rounded bg-[var(--bg-input)] text-[var(--accent-primary-text)] font-bold">
                {viewerType}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setScale((s) => Math.min(2, s + 0.2))}
            className="p-1 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--heading-color)] transition-colors cursor-pointer"
            aria-label="Zoom in"
            title="Zoom in"
          >
            <IconZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}
            className="p-1 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--heading-color)] transition-colors cursor-pointer"
            aria-label="Zoom out"
            title="Zoom out"
          >
            <IconZoomOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Page nav bar (PDF only) */}
      {viewerType === "pdf" && (
        <div className="flex items-center justify-center gap-2 px-3 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 shrink-0">
          <button
            onClick={() => goTo(pageNumber - 1)}
            disabled={!numPages || pageNumber <= 1}
            className="icon-action p-1 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed hover:text-[var(--heading-color)] transition-colors cursor-pointer"
            aria-label="Previous page"
          >
            <IconChevronLeft className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={numPages ?? 1}
              value={pageNumber}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!Number.isNaN(n)) setPageNumber(n);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") goTo(pageNumber);
              }}
              onBlur={() => goTo(pageNumber)}
              className="w-12 px-1.5 py-0.5 rounded bg-[var(--bg-input)] border border-[var(--border-subtle)] text-center text-xs font-mono text-[var(--heading-color)] focus:outline-none focus:border-[var(--accent-primary-border)]"
              aria-label="Jump to page number"
            />
            <span className="text-xs text-[var(--text-tertiary)] font-mono">
              / {numPages ?? "…"}
            </span>
          </div>
          <button
            onClick={() => goTo(pageNumber + 1)}
            disabled={!numPages || pageNumber >= numPages}
            className="icon-action p-1 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed hover:text-[var(--heading-color)] transition-colors cursor-pointer"
            aria-label="Next page"
          >
            <IconChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Dynamic Content Viewers */}
      {viewerType === "text" ? (
        <MarkdownViewer
          documentId={documentId}
          fileUrl={fileUrl}
          initialPage={initialPage}
          snippet={snippet}
          title={title}
          fontScale={scale}
          onPageChange={(p, total) => {
            setPageNumber(p);
            setNumPages(total);
          }}
        />
      ) : viewerType === "image" ? (
        <ImageViewer fileUrl={fileUrl} title={title} scale={scale} />
      ) : (
        /* Scrollable PDF Container */
        <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto p-3 bg-[var(--bg-page)] space-y-4">
          {loadError ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-2">
              <IconFileText className="w-8 h-8 text-[var(--text-tertiary)]" />
              <p className="text-sm text-[var(--text-tertiary)] max-w-xs">{loadError}</p>
            </div>
          ) : (
            <Document
              file={fileUrl}
              onLoadSuccess={handleLoadSuccess}
              onLoadError={handleLoadError}
              className="flex flex-col items-center gap-4"
            >
              {Array.from(new Array(numPages || 0), (_, index) => {
                const pNum = index + 1;
                return (
                  <div
                    key={`pdf_page_${pNum}`}
                    data-page-number={pNum}
                    ref={(el) => {
                      pageRefs.current[pNum] = el;
                    }}
                    className={`shadow-lg rounded-xl overflow-hidden bg-[var(--bg-card-solid)] border transition-all ${
                      pNum === pageNumber
                        ? "border-[var(--accent-primary-border)] ring-2 ring-[var(--accent-primary-ring)]"
                        : "border-[var(--border-subtle)]"
                    }`}
                  >
                    <Page
                      pageNumber={pNum}
                      width={Math.max(260, width - 24)}
                      scale={scale}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                    <div className="py-1 px-3 bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] text-center text-[10px] font-mono font-semibold text-[var(--text-tertiary)] flex items-center justify-between">
                      <span>Page {pNum} of {numPages}</span>
                      {pNum === initialPage && (
                        <span className="px-1.5 py-0.5 rounded bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] font-sans font-bold text-[9px]">
                          Cited Page
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </Document>
          )}
        </div>
      )}
    </div>
  );
});
