"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { IconX, IconChevronLeft, IconChevronRight, IconFileText, IconZoomIn, IconZoomOut } from "@tabler/icons-react";

// Must be configured in the same module that renders <Document>/<Page>.
// Bundled as a static asset so it also works under `output: "export"`.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

interface CitationSidePanelProps {
  fileUrl: string;
  initialPage?: number;
  title?: string;
  onClose: () => void;
}

export default function CitationSidePanel({ fileUrl, initialPage = 1, title, onClose }: CitationSidePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
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

  const goTo = (n: number) => {
    if (!numPages) return;
    setPageNumber(Math.min(Math.max(1, n), numPages));
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--bg-card)] border-l border-[var(--border-visible)]">
      {/* Header */}
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-[var(--accent-primary-soft)] border border-[var(--accent-primary-border)] text-[var(--accent-primary-text)] shrink-0">
            <IconFileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-[var(--heading-color)] truncate">
              {title || "Source Document"}
            </p>
            <p className="text-[10px] text-[var(--text-tertiary)]">
              Page {pageNumber}{numPages ? ` of ${numPages}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setScale((s) => Math.min(2, s + 0.2))}
            className="icon-action p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--heading-color)] transition-colors cursor-pointer"
            aria-label="Zoom in"
            title="Zoom in"
          >
            <IconZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}
            className="icon-action p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--heading-color)] transition-colors cursor-pointer"
            aria-label="Zoom out"
            title="Zoom out"
          >
            <IconZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="icon-action p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-danger-text)] hover:border-[var(--accent-danger-border)] transition-colors cursor-pointer"
            aria-label="Close viewer"
            title="Close viewer"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Page nav */}
      <div className="flex items-center justify-center gap-2 px-4 py-2 border-b border-[var(--border-subtle)] shrink-0">
        <button
          onClick={() => goTo(pageNumber - 1)}
          disabled={!numPages || pageNumber <= 1}
          className="icon-action p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed hover:text-[var(--heading-color)] transition-colors cursor-pointer"
          aria-label="Previous page"
        >
          <IconChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            max={numPages ?? 1}
            value={pageNumber}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!Number.isNaN(n)) setPageNumber(n);
            }}
            onBlur={() => goTo(pageNumber)}
            className="w-14 px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-center text-xs font-mono text-[var(--heading-color)] focus:outline-none focus:border-[var(--accent-primary-border-focus)]"
            aria-label="Current page number"
          />
          <span className="text-xs text-[var(--text-tertiary)] font-mono">
            / {numPages ?? "…"}
          </span>
        </div>
        <button
          onClick={() => goTo(pageNumber + 1)}
          disabled={!numPages || pageNumber >= numPages}
          className="icon-action p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed hover:text-[var(--heading-color)] transition-colors cursor-pointer"
          aria-label="Next page"
        >
          <IconChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Document */}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto p-4 bg-[var(--bg-page)]">
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
            className="flex justify-center"
          >
            <div className="shadow-xl rounded-md overflow-hidden bg-[var(--bg-card-solid)]">
              <Page
                pageNumber={pageNumber}
                width={Math.max(280, width)}
                scale={scale}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </div>
          </Document>
        )}
      </div>
    </div>
  );
}
