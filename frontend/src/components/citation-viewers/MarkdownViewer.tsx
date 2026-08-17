"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchDocumentContent } from "@/lib/api";
import { IconFileText, IconLoader2 } from "@tabler/icons-react";

interface MarkdownViewerProps {
  documentId?: string | null;
  fileUrl: string;
  initialPage?: number;
  title?: string;
  fontScale?: number;
  onPageChange?: (p: number, total: number) => void;
  snippet?: string | null;
}

function cleanMarkdownText(content: string): string {
  if (!content) return "";
  let text = content;
  if (text.includes("\\n")) {
    text = text.replace(/\\n/g, "\n");
  }
  return text
    .split("\n")
    .map((line) => line.trimStart())
    .join("\n");
}

export default function MarkdownViewer({
  documentId,
  fileUrl,
  initialPage = 1,
  title,
  fontScale = 1.0,
  onPageChange,
  snippet,
}: MarkdownViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [docData, setDocData] = useState<{ page_count: number; pages: { page_number: number; content: string }[] } | null>(null);
  const [activePage, setActivePage] = useState(initialPage);

  useEffect(() => {
    let isMounted = true;
    async function loadContent() {
      setLoading(true);
      setError(null);
      try {
        if (documentId) {
          const data = await fetchDocumentContent(documentId);
          if (isMounted) {
            setDocData(data);
            if (onPageChange) onPageChange(initialPage, data.pages?.length || 1);
          }
        } else {
          // Fallback if documentId is missing: try fetching raw text fileUrl
          const res = await fetch(fileUrl);
          const rawText = await res.text();
          if (isMounted) {
            const data = {
              page_count: 1,
              pages: [{ page_number: 1, content: rawText }],
            };
            setDocData(data);
            if (onPageChange) onPageChange(1, 1);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load document text.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadContent();
    return () => {
      isMounted = false;
    };
  }, [documentId, fileUrl]);

  // Scroll to initialPage when content loaded
  useEffect(() => {
    if (docData && initialPage && pageRefs.current[initialPage]) {
      const timer = setTimeout(() => {
        pageRefs.current[initialPage]?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [docData, initialPage]);

  // Track active page while scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !docData) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pStr = entry.target.getAttribute("data-page-number");
            if (pStr) {
              const p = parseInt(pStr, 10);
              if (!isNaN(p)) {
                setActivePage(p);
                if (onPageChange) onPageChange(p, docData.pages.length);
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
  }, [docData, onPageChange]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-3">
        <IconLoader2 className="w-8 h-8 animate-spin text-[var(--accent-primary-text)]" />
        <p className="text-xs font-semibold text-[var(--heading-color)]">
          Loading document content...
        </p>
      </div>
    );
  }

  if (error || !docData || docData.pages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-3">
        <IconFileText className="w-10 h-10 text-[var(--text-tertiary)]" />
        <p className="text-sm font-semibold text-[var(--heading-color)]">
          Document Preview Unavailable
        </p>
        <p className="text-xs text-[var(--text-tertiary)] max-w-xs">
          {error || "No text content found for this document."}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 overflow-y-auto p-4 bg-[var(--bg-page)] space-y-6 select-text"
      style={{ fontSize: `${fontScale * 100}%` }}
    >
      {docData.pages.map((p) => {
        const isCitedPage = p.page_number === initialPage;
        const cleanedText = cleanMarkdownText(p.content);

        return (
          <div
            key={`doc_page_${p.page_number}`}
            data-page-number={p.page_number}
            ref={(el) => {
              pageRefs.current[p.page_number] = el;
            }}
            className={`p-5 rounded-2xl bg-[var(--bg-card-solid)] border shadow-md transition-all ${
              isCitedPage
                ? "border-[var(--accent-primary-border)] ring-2 ring-[var(--accent-primary-ring)]"
                : "border-[var(--border-subtle)]"
            }`}
          >
            {/* Page Header */}
            <div className="pb-3 mb-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--heading-color)] font-mono">
                📄 Page {p.page_number} of {docData.pages.length}
              </span>
              {isCitedPage && (
                <span className="px-2 py-0.5 rounded-full bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)] text-[10px] font-sans font-bold">
                  Cited Page
                </span>
              )}
            </div>

            {/* Rich Text Page Content */}
            <div className="prose dark:prose-invert max-w-none text-xs leading-relaxed text-[var(--heading-color)] font-sans">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({ node, ...props }) => (
                    <div className="overflow-x-auto my-2">
                      <table className="min-w-full text-xs border border-[var(--border-subtle)] border-collapse" {...props} />
                    </div>
                  ),
                  th: ({ node, ...props }) => (
                    <th className="px-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] font-bold text-left" {...props} />
                  ),
                  td: ({ node, ...props }) => (
                    <td className="px-3 py-1.5 border border-[var(--border-subtle)] text-[var(--heading-color)]" {...props} />
                  ),
                  h1: ({ node, ...props }) => <h1 className="text-base font-extrabold my-2 text-[var(--accent-primary-text)] border-b border-[var(--border-subtle)] pb-1" {...props} />,
                  h2: ({ node, ...props }) => <h2 className="text-sm font-extrabold my-2 text-[var(--accent-primary-text)] border-b border-[var(--border-subtle)] pb-1" {...props} />,
                  h3: ({ node, ...props }) => <h3 className="text-xs font-bold my-1.5 text-[var(--heading-color)]" {...props} />,
                  strong: ({ node, ...props }) => <strong className="font-bold text-[var(--heading-color)]" {...props} />,
                  p: ({ node, ...props }) => <p className="my-1.5 leading-relaxed text-[var(--heading-color)]" {...props} />,
                  ul: ({ node, ...props }) => <ul className="list-disc pl-5 my-2 space-y-1" {...props} />,
                  ol: ({ node, ...props }) => <ol className="list-decimal pl-5 my-2 space-y-1" {...props} />,
                  code: ({ node, inline, ...props }: any) =>
                    inline ? (
                      <code className="px-1 py-0.5 rounded bg-[var(--bg-input)] font-mono text-[11px] border border-[var(--border-subtle)]" {...props} />
                    ) : (
                      <code className="block p-3 rounded-xl bg-[var(--bg-input)] font-mono text-[11px] overflow-x-auto border border-[var(--border-subtle)] my-2" {...props} />
                    ),
                }}
              >
                {cleanedText}
              </ReactMarkdown>
            </div>
          </div>
        );
      })}
    </div>
  );
}
