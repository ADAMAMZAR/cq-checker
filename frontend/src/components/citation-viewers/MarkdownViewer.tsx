"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

interface QaBlock {
  block_id: string;
  page_number: number;
  qa_index: number;
  content: string;
}

function parseQaBlocks(pages: { page_number: number; content: string }[]): QaBlock[] {
  const blocks: QaBlock[] = [];
  let activeSectionHeader = "";

  pages.forEach((p) => {
    const cleaned = cleanMarkdownText(p.content);
    // Split by any Markdown header (#, ##, ###)
    const rawParts = cleaned.split(/(?=\n#{1,3}\s+)/g).map((s) => s.trim()).filter(Boolean);

    rawParts.forEach((part) => {
      let cleanPart = part.replace(/^---\s*/gm, "").trim();
      if (!cleanPart) return;

      const lines = cleanPart.split("\n");
      const firstLine = lines[0] || "";

      // Check if this part starts with a Level 1 Section Header (# Title)
      if (/^#\s+/.test(firstLine) && !/Q\d+:/i.test(firstLine)) {
        activeSectionHeader = firstLine.trim();
        cleanPart = lines.slice(1).join("\n").trim();
      }

      // Strip any trailing level 1 section headers at the end of a block
      cleanPart = cleanPart.replace(/---\s*#\s+.*$/s, "").trim();
      cleanPart = cleanPart.replace(/\n#\s+[^#\n]+$/s, "").trim();

      if (!cleanPart) return;

      let blockContent = cleanPart;
      if (activeSectionHeader && !blockContent.startsWith(activeSectionHeader)) {
        blockContent = `${activeSectionHeader}\n\n${blockContent}`;
      }

      // Ensure sequential page numbering even if loaded from single raw fileUrl
      const resolvedPageNum = pages.length === 1 ? blocks.length + 1 : p.page_number;

      blocks.push({
        block_id: `p${resolvedPageNum}_qa${blocks.length + 1}`,
        page_number: resolvedPageNum,
        qa_index: blocks.length + 1,
        content: blockContent,
      });
    });
  });

  return blocks;
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
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
        // Single unified data loader for both citation clicks & system sources list
        const data = documentId
          ? await fetchDocumentContent(documentId)
          : await fetch(fileUrl).then(async (res) => {
              const text = await res.text();
              return { page_count: 1, pages: [{ page_number: 1, content: text }] };
            });

        if (isMounted) {
          setDocData(data);
          if (onPageChange) onPageChange(initialPage, data.pages?.length || 1);
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

  const qaBlocks = useMemo(() => parseQaBlocks(docData?.pages || []), [docData]);

  // Target exact Q&A card using initialPage first, matching snippet text if multiple blocks on same page
  const targetBlockId = useMemo(() => {
    if (!qaBlocks.length) return null;

    // 1. Match by initialPage (the exact chunk page_number from PostgreSQL)
    const pageBlocks = qaBlocks.filter((b) => b.page_number === initialPage);
    if (pageBlocks.length === 1) {
      return pageBlocks[0].block_id;
    }

    if (pageBlocks.length > 1 && snippet && snippet.trim()) {
      const cleanSnippet = snippet.toLowerCase().replace(/[^a-z0-9]/g, "");
      for (const block of pageBlocks) {
        const cleanBlock = block.content.toLowerCase().replace(/[^a-z0-9]/g, "");
        const sub = cleanBlock.slice(15, 60);
        if (sub && (cleanSnippet.includes(sub) || cleanBlock.includes(cleanSnippet.slice(15, 60)))) {
          return block.block_id;
        }
      }
      return pageBlocks[0].block_id;
    }

    // 2. Fallback if initialPage is not found directly
    const fallbackBlock = qaBlocks.find((b) => b.page_number === initialPage);
    return fallbackBlock ? fallbackBlock.block_id : qaBlocks[0].block_id;
  }, [qaBlocks, snippet, initialPage]);

  // Scroll smoothly to exact target Q&A block when ready
  useEffect(() => {
    if (targetBlockId && blockRefs.current[targetBlockId]) {
      const timer = setTimeout(() => {
        blockRefs.current[targetBlockId]?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [targetBlockId]);

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
                if (onPageChange) onPageChange(p, qaBlocks.length);
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

    Object.values(blockRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [docData, qaBlocks, onPageChange]);

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
      className="flex-1 min-h-0 overflow-y-auto p-4 bg-[var(--bg-page)] space-y-5 select-text"
      style={{ fontSize: `${fontScale * 100}%` }}
    >
      {qaBlocks.map((block) => {
        const isCitedBlock = block.block_id === targetBlockId;

        return (
          <div
            key={block.block_id}
            data-page-number={block.page_number}
            ref={(el) => {
              blockRefs.current[block.block_id] = el;
            }}
            className={`p-5 rounded-2xl bg-[var(--bg-card-solid)] border shadow-md transition-all ${
              isCitedBlock
                ? "border-[var(--accent-primary-border)] ring-2 ring-[var(--accent-primary-ring)] bg-[var(--accent-primary-soft)]/20"
                : "border-[var(--border-subtle)]"
            }`}
          >
            {/* Uniform Card Header */}
            <div className="pb-3 mb-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--heading-color)] font-mono flex items-center gap-2">
                <span>📄 Q&A Pair #{block.page_number} of {qaBlocks.length}</span>
              </span>
              {isCitedBlock && (
                <span className="px-2.5 py-0.5 rounded-full bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)] text-[10px] font-sans font-extrabold animate-pulse">
                  Cited Q&A Pair
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
                  h1: ({ node, ...props }) => <h1 className="text-sm font-black my-2.5 text-[var(--accent-primary-text)] bg-[var(--accent-primary-soft)] p-2 rounded-xl border border-[var(--accent-primary-border)] font-sans" {...props} />,
                  h2: ({ node, ...props }) => <h2 className="text-xs font-extrabold my-2 text-[var(--accent-primary-text)] border-b border-[var(--border-subtle)] pb-1 font-sans" {...props} />,
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
                {block.content}
              </ReactMarkdown>
            </div>
          </div>
        );
      })}
    </div>
  );
}
