import { useCallback, useEffect, useRef, useState, memo, useMemo } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  IconRobot,
  IconSend,
  IconUser,
  IconTrash,
  IconBulb,
  IconArrowLeft,
  IconSourceCode,
  IconThumbUp,
  IconThumbDown,
  IconCopy,
  IconCheck,
  IconPlayerStop,
  IconX,
  IconFiles,
  IconFileText,
  IconSearch,
  IconRefresh,
  IconLoader2,
  IconFolder,
  IconFolderPlus,
  IconChevronDown,
  IconChevronRight,
} from "@tabler/icons-react";
import {
  sendChat,
  fetchChatHistory,
  fetchDocuments,
  buildFileUrl,
  submitFeedback,
  fetchFolders,
  createFolder,
  deleteFolder,
  moveDocumentFolder,
} from "@/lib/api";
import type { ChatSource, FeedbackRating, DocumentSummary, DocumentFolder } from "@/types";

const CitationSidePanel = dynamic(() => import("@/components/CitationSidePanel"), { ssr: false });

interface ChatbotProps {
  onGoHome?: () => void;
}

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
  sources?: ChatSource[];
  cacheHit?: boolean;
  costUsd?: number;
  isStreaming?: boolean;
  dbMessageId?: string;
  feedbackGiven?: FeedbackRating;
  debugTracing?: any;
}

const SESSION_KEY = "cq_chat_session";
const SUGGESTIONS = [
  "Summarize the safety manual requirements",
  "What are the QA checklist items?",
  "List key compliance steps for suppliers",
];

function formatCitationLinks(text: string): string {
  if (!text) return "";
  let cleanText = text
    .replace(/\$\\rightarrow\$/g, "→")
    .replace(/\\rightarrow/g, "→")
    .replace(/\$\\Rightarrow\$/g, "⇒")
    .replace(/\\Rightarrow/g, "⇒");

  // Auto-number multi-line procedures if the model omitted "1. ", "2. " prefixes
  if (!/^\s*\d+\.\s+/m.test(cleanText)) {
    const rawLines = cleanText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (
      rawLines.length >= 3 &&
      rawLines.every((l) => !l.startsWith("#") && !l.startsWith("-") && !l.startsWith("*"))
    ) {
      cleanText = rawLines.map((line, idx) => `${idx + 1}. ${line}`).join("\n");
    }
  }

  return cleanText.replace(/\[(\d+(?:[\s,–-]+\d+)*)\]/g, (match, p1) => {
    if (p1.includes("-") || p1.includes("–")) {
      const parts = p1.split(/[-–]/).map((s: string) => parseInt(s.trim(), 10));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const nums = [];
        for (let i = parts[0]; i <= parts[1]; i++) nums.push(i);
        return nums.map((n) => `[${n}](#cite-${n})`).join(" ");
      }
    }
    const nums = p1.split(",").map((s: string) => s.trim()).filter((s: string) => /^\d+$/.test(s));
    if (nums.length > 0) {
      return nums.map((n: string) => `[${n}](#cite-${n})`).join(" ");
    }
    return match;
  });
}

function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const REMARK_PLUGINS = [remarkGfm];

const FEEDBACK_REASONS = [
  "Incorrect information",
  "Incomplete answer",
  "Off-topic response",
  "Too verbose",
  "Other",
] as const;

const ChatMessageItem = memo(function ChatMessageItem({
  msg,
  onOpenCitation,
  onFeedback,
}: {
  msg: ChatMessage;
  onOpenCitation: (src: ChatSource) => void;
  onFeedback: (msg: ChatMessage, rating: FeedbackRating) => void;
}) {
  const [copied, setCopied] = useState(false);
  const formattedText = useMemo(() => formatCitationLinks(msg.text), [msg.text]);

  const handleCopy = useCallback(() => {
    const textToCopy = formattedText || msg.text;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [formattedText, msg.text]);

  const markdownComponents = useMemo(
    () => ({
      ol({ children, ...props }: any) {
        return (
          <ol className="list-decimal pl-6 my-2 space-y-1.5 text-left font-normal" {...props}>
            {children}
          </ol>
        );
      },
      ul({ children, ...props }: any) {
        return (
          <ul className="list-disc pl-6 my-2 space-y-1.5 text-left font-normal" {...props}>
            {children}
          </ul>
        );
      },
      li({ children, ...props }: any) {
        return (
          <li className="pl-1 leading-relaxed" {...props}>
            {children}
          </li>
        );
      },
      a({ href, children, ...props }: any) {
        if (href?.startsWith("#cite-")) {
          const idx = parseInt(href.replace("#cite-", ""), 10) - 1;
          const src = msg.sources?.[idx];
          return (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (src) onOpenCitation(src);
              }}
              disabled={!src}
              className="inline-flex items-center justify-center px-1.5 py-0.5 mx-0.5 text-[10px] font-black rounded-full bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)] hover:bg-[var(--accent-primary)] hover:text-white hover:border-[var(--accent-primary-border-strong)] transition-all transform hover:scale-110 cursor-pointer shadow-xs align-middle inline-block select-none disabled:opacity-40 disabled:cursor-not-allowed"
              title={src ? `${src.title || "Source"} (Page ${src.page_number ?? "?"})` : `Citation [${idx + 1}]`}
              type="button"
            >
              {children}
            </button>
          );
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent-primary-text)] underline font-medium hover:opacity-80"
            {...props}
          >
            {children}
          </a>
        );
      },
    }),
    [msg.sources, onOpenCitation]
  );

  return (
    <div className={`flex items-start gap-3 max-w-3xl ${msg.sender === "user" ? "self-end flex-row-reverse" : "self-start"}`}>
      {/* Avatar */}
      <div
        className={`p-2 rounded-xl shrink-0 border ${msg.sender === "user"
          ? "bg-[var(--accent-primary)] border-[var(--accent-primary-border-strong)] text-white"
          : "bg-[var(--accent-primary-soft)] border-[var(--accent-primary-border)] text-[var(--accent-primary-text)]"
          }`}
      >
        {msg.sender === "user" ? <IconUser className="w-5 h-5" /> : <IconRobot className="w-5 h-5" />}
      </div>
      <div className={`flex flex-col gap-2 ${msg.sender === "user" ? "items-end" : "items-start"}`}>
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-tertiary)] px-1">
          <span className="font-semibold">{msg.sender === "user" ? "You" : "Procurement Assistant"}</span>
          {/* <span>{msg.timestamp}</span> */}
          {/* {msg.costUsd !== undefined && msg.sender === "ai" && !msg.isStreaming && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold border bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border-[var(--accent-primary-border)]">
              ${msg.costUsd.toFixed(6)}
            </span>
          )} */}
        </div>
        <div
          className={`p-4 rounded-2xl text-sm leading-relaxed ${msg.sender === "user"
            ? "bg-[var(--accent-primary)] text-white rounded-tr-none shadow-lg"
            : "bg-[var(--bg-surface)] border border-[var(--border-visible)] text-[var(--heading-color)] rounded-tl-none shadow-md"
            }`}
        >
          {msg.sender === "user" ? (
            <p className="whitespace-pre-wrap break-words">{msg.text}</p>
          ) : msg.isStreaming && msg.text === "" ? (
            <div className="flex items-center gap-2 py-1">
              <span className="text-xs text-[var(--text-secondary)]">Thinking…</span>
              <span className="flex gap-1" aria-hidden="true">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary-text)] typing-dot" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary-text)] typing-dot" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary-text)] typing-dot" style={{ animationDelay: "300ms" }} />
              </span>
            </div>
          ) : (
            <div className="prose prose-sm max-w-none font-sans">
              <ReactMarkdown
                remarkPlugins={REMARK_PLUGINS}
                components={markdownComponents}
              >
                {formattedText}
              </ReactMarkdown>
            </div>
          )}
        </div>
        {msg.sources && msg.sources.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-2 max-w-2xl">
            <span className="text-[10px] font-bold tracking-wider text-[var(--text-tertiary)]  flex items-center gap-1">
              <IconSourceCode className="w-3.5 h-3.5 text-[var(--accent-primary-text)]" /> Sources & References ({msg.sources.length})
            </span>
            <div className="flex flex-wrap gap-2">
              {msg.sources.map((src, idx) => (
                <button
                  key={`${msg.id}-src-${idx}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenCitation(src);
                  }}
                  disabled={!buildFileUrl(src.file_url)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary-border)] hover:bg-[var(--accent-primary-soft)] text-xs font-semibold text-[var(--heading-color)] hover:text-[var(--accent-primary-text)] transition-all cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                  title={`${src.title || "Source"} — Page ${src.page_number ?? "?"}`}
                >
                  <span className="w-4 h-4 rounded-full bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] text-[10px] font-black flex items-center justify-center border border-[var(--accent-primary-border)] shrink-0">
                    {idx + 1}
                  </span>
                  <span className="truncate max-w-[200px]">{src.title || "Source"}</span>
                  {src.page_number ? (
                    <span className="px-1.5 py-0.5 rounded bg-[var(--bg-input)] text-[10px] font-mono text-[var(--text-tertiary)] font-bold">
                      pg.{src.page_number}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        )}
        {msg.sender === "ai" && !msg.isStreaming && msg.text && (
          <div className="flex items-center gap-1 mt-2">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--heading-color)] hover:bg-[var(--accent-primary-soft)] transition-all cursor-pointer border border-[var(--border-subtle)] hover:border-[var(--accent-primary-border)] shadow-xs"
              title="Copy response text"
              aria-label="Copy response text"
              type="button"
            >
              {copied ? (
                <>
                  <IconCheck className="w-3.5 h-3.5 text-[var(--accent-success)]" />
                  <span className="text-[11px] font-semibold text-[var(--accent-success)]">Copied!</span>
                </>
              ) : (
                <>
                  <IconCopy className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                  <span className="text-[11px]">Copy</span>
                </>
              )}
            </button>

            {msg.dbMessageId && (
              <>
                <div className="w-px h-3.5 bg-[var(--border-subtle)] mx-0.5" />
                <button
                  onClick={() => onFeedback(msg, "satisfied")}
                  disabled={!!msg.feedbackGiven}
                  className={`p-1.5 rounded-lg transition-all ${msg.feedbackGiven === "satisfied"
                    ? "bg-[var(--accent-success)] text-white"
                    : msg.feedbackGiven
                      ? "text-[var(--text-tertiary)] opacity-40 cursor-not-allowed"
                      : "text-[var(--text-secondary)] hover:text-[var(--accent-success)] hover:bg-[var(--accent-primary-soft)] cursor-pointer"
                    }`}
                  title="Satisfied"
                  aria-label="Mark as satisfied"
                >
                  <IconThumbUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onFeedback(msg, "not_satisfied")}
                  disabled={!!msg.feedbackGiven}
                  className={`p-1.5 rounded-lg transition-all ${msg.feedbackGiven === "not_satisfied"
                    ? "bg-[var(--accent-danger)] text-white"
                    : msg.feedbackGiven
                      ? "text-[var(--text-tertiary)] opacity-40 cursor-not-allowed"
                      : "text-[var(--text-secondary)] hover:text-[var(--accent-danger-text)] hover:bg-[var(--accent-primary-soft)] cursor-pointer"
                    }`}
                  title="Not satisfied"
                  aria-label="Mark as not satisfied"
                >
                  <IconThumbDown className="w-4 h-4" />
                </button>
                {msg.feedbackGiven && (
                  <span className="text-[10px] text-[var(--text-tertiary)] ml-1">
                    Thanks for your feedback
                  </span>
                )}
              </>
            )}
          </div>
        )}
        {msg.sender === "ai" && msg.debugTracing && (
          <DebugTracingAccordion debugTracing={msg.debugTracing} />
        )}
      </div>
    </div>
  );
});

function DebugTracingAccordion({ debugTracing }: { debugTracing: any }) {
  const [isOpen, setIsOpen] = useState(false);
  if (!debugTracing) return null;

  return (
    <div className="mt-2.5 pt-2 border-t border-[var(--border-subtle)] text-xs">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--bg-input)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[10px] font-bold text-[var(--accent-primary-text)] cursor-pointer transition-all"
      >
        <span>🔍 Debug PostgreSQL Retrieval & Citation Tracing</span>
        {isOpen ? <IconChevronDown className="w-3 h-3" /> : <IconChevronRight className="w-3 h-3" />}
      </button>

      {isOpen && (
        <div className="mt-2 p-2.5 rounded-xl bg-[var(--bg-input)]/90 border border-[var(--border-subtle)] space-y-3 text-[11px] font-mono text-[var(--text-primary)]">
          {/* Section 1: PostgreSQL Retrieved Chunks */}
          <div>
            <h5 className="font-bold text-[var(--heading-color)] flex items-center gap-1 mb-1.5 text-[11px]">
              📊 PostgreSQL Retrieved Chunks ({debugTracing.retrieved_chunks_count ?? 0})
            </h5>
            <div className="space-y-1.5">
              {(debugTracing.postgres_chunks || []).map((chunk: any) => (
                <div key={chunk.chunk_index} className="p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between text-[10px] font-bold text-[var(--accent-primary-text)] mb-1">
                    <span>Chunk #{chunk.chunk_index}: {chunk.document_title} ({chunk.page_range})</span>
                    <span className="px-1.5 py-0.5 rounded bg-[var(--accent-primary-soft)] border border-[var(--accent-primary-border)] text-emerald-400">
                      Score: {chunk.combined_score}
                    </span>
                  </div>
                  <pre className="whitespace-pre-wrap break-words text-[10px] text-[var(--text-secondary)] font-sans leading-relaxed bg-[var(--bg-surface)] p-2 rounded border border-[var(--border-subtle)] max-h-96 overflow-y-auto">
                    {chunk.content_snippet}
                  </pre>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Citation Mapping */}
          {debugTracing.citation_mapping && debugTracing.citation_mapping.length > 0 && (
            <div>
              <h5 className="font-bold text-[var(--heading-color)] mb-1 text-[11px]">
                🔗 Citation Mapping
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[10px]">
                {debugTracing.citation_mapping.map((c: any, i: number) => (
                  <div key={i} className="flex items-center gap-1.5 p-1.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                    <span className="font-bold text-[var(--accent-primary-text)]">{c.citation}</span>
                    <span className="truncate">{c.title} (pg.{c.page_number})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 3: Prompt Context */}
          {debugTracing.prompt_context_fed_to_gemini && (
            <div>
              <h5 className="font-bold text-[var(--heading-color)] mb-1 text-[11px]">
                📝 Context Fed to Gemini Prompt
              </h5>
              <pre className="whitespace-pre-wrap break-words text-[10px] text-[var(--text-secondary)] bg-[var(--bg-surface)] p-2 rounded border border-[var(--border-subtle)] max-h-96 overflow-y-auto">
                {debugTracing.prompt_context_fed_to_gemini}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FeedbackModal({
  messageId,
  onClose,
  onSubmit,
}: {
  messageId: string;
  onClose: () => void;
  onSubmit: (messageId: string, rating: FeedbackRating, reason?: string) => Promise<void>;
}) {
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [customReason, setCustomReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const toggleReason = (reason: string) => {
    setSelectedReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
    );
  };

  const handleSubmit = async () => {
    const reasons = [...selectedReasons];
    if (customReason.trim()) reasons.push(customReason.trim());
    const reasonText = reasons.join("; ") || undefined;

    setSubmitting(true);
    try {
      await onSubmit(messageId, "not_satisfied", reasonText);
      onClose();
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[var(--bg-card)] border border-[var(--border-visible)] rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-slide-up">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
          <h3 className="text-base font-bold text-[var(--heading-color)]">
            What went wrong?
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-surface)] transition-all cursor-pointer"
            aria-label="Close"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Help us improve by telling us what was wrong with this response.
          </p>
          <div className="flex flex-wrap gap-2">
            {FEEDBACK_REASONS.map((reason) => (
              <button
                key={reason}
                onClick={() => toggleReason(reason)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${selectedReasons.includes(reason)
                  ? "bg-[var(--accent-primary)] text-white border-[var(--accent-primary-border-strong)]"
                  : "bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--accent-primary-border)] hover:text-[var(--accent-primary-text)]"
                  } cursor-pointer`}
              >
                {reason}
              </button>
            ))}
          </div>
          <textarea
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            placeholder="Or describe the issue in your own words..."
            rows={3}
            className="w-full px-3 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-visible)] rounded-xl text-[var(--heading-color)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--accent-primary-border-focus)] focus:ring-2 focus:ring-[var(--accent-primary-ring)] transition-all resize-none"
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--border-subtle)]">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-surface)] transition-all cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || (!selectedReasons.length && !customReason.trim())}
            className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Submitting..." : "Submit Feedback"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Chatbot({ onGoHome }: ChatbotProps = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [pdfView, setPdfView] = useState<{ fileUrl: string; page: number; title: string; documentId?: string | null; contentType?: string | null } | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState<{ messageId: string } | null>(null);

  const [systemDocs, setSystemDocs] = useState<DocumentSummary[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [docFilter, setDocFilter] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [leftWidth, setLeftWidth] = useState<number>(28); // 28% default width (min 25%, max 60%)
  const isDraggingRef = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const container = document.getElementById("chatbot-container");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const relativeX = moveEvent.clientX - rect.left;
      const newPct = (relativeX / rect.width) * 100;
      // Clamp between 25% minimum and 60% maximum
      const clamped = Math.min(60, Math.max(25, newPct));
      setLeftWidth(clamped);
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, []);

  const loadSystemDocsAndFolders = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const [docs, fList] = await Promise.all([fetchDocuments(), fetchFolders()]);
      setSystemDocs(docs);
      setFolders(fList);
    } catch (err) {
      console.error("Failed to load system documents/folders:", err);
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  useEffect(() => {
    loadSystemDocsAndFolders();
  }, [loadSystemDocsAndFolders]);

  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);

  const handleMoveDoc = async (docId: string, folderId: string) => {
    try {
      await moveDocumentFolder(docId, folderId || null);
      loadSystemDocsAndFolders();
    } catch (err) {
      console.error("Failed to move document:", err);
    }
  };

  const toggleFolderExpand = (folderName: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderName]: prev[folderName] === undefined ? true : !prev[folderName],
    }));
  };

  const folderGroupedDocs = useMemo(() => {
    const sorted = [...systemDocs].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true })
    );
    const q = docFilter.trim().toLowerCase();
    const filtered = q ? sorted.filter((d) => d.title.toLowerCase().includes(q)) : sorted;

    const groups: Record<string, DocumentSummary[]> = {};
    folders.forEach((f) => {
      groups[f.name] = [];
    });
    if (!groups["General"]) groups["General"] = [];

    filtered.forEach((doc) => {
      const fname = doc.folder_name || "General";
      if (!groups[fname]) groups[fname] = [];
      groups[fname].push(doc);
    });

    return groups;
  }, [systemDocs, folders, docFilter]);

  const handleOpenCitation = useCallback((src: ChatSource) => {
    const url = buildFileUrl(src.file_url);
    if (!url) return;
    setPdfView({
      fileUrl: url,
      page: src.page_number ?? 1,
      title: src.title,
      documentId: src.document_id,
      contentType: src.content_type,
    });
  }, []);

  const handleSelectSourceDoc = useCallback((doc: DocumentSummary) => {
    const url = buildFileUrl(doc.file_url);
    if (!url) return;
    setPdfView({
      fileUrl: url,
      page: 1,
      title: doc.title,
      documentId: doc.id,
      contentType: (doc as any).content_type || "",
    });
  }, []);
  const sessionRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const getSessionId = useCallback((): string => {
    if (sessionRef.current) return sessionRef.current;
    let sid = localStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, sid);
    }
    sessionRef.current = sid;
    return sid;
  }, []);

  // Load conversation history for the persisted session on first mount.
  useEffect(() => {
    const sid = getSessionId();
    fetchChatHistory(sid)
      .then((res) => {
        if (!res.messages.length) return;
        setMessages(
          res.messages.map((m: any) => ({
            id: `${m.role}-${m.created_at ?? Date.now()}`,
            sender: m.role === "user" ? "user" : "ai",
            text: m.content,
            sources: m.sources ?? [],
            timestamp: m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : nowLabel(),
            dbMessageId: m.id ?? undefined,
            feedbackGiven: m.feedback_rating ?? undefined,
          }))
        );
      })
      .catch(() => {
        /* history unavailable — start fresh */
      })
      .finally(() => setHistoryLoaded(true));
  }, [getSessionId]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      if (!input) {
        textareaRef.current.style.height = "38px";
      } else {
        textareaRef.current.style.height = "auto";
        const newHeight = Math.max(38, Math.min(textareaRef.current.scrollHeight, 140));
        textareaRef.current.style.height = `${newHeight}px`;
      }
    }
  }, [input]);

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsTyping(false);
  }, []);

  const scrollToBottom = useCallback((instant = false) => {
    if (scrollContainerRef.current) {
      const el = scrollContainerRef.current;
      // Wrap layout reads in requestAnimationFrame to avoid synchronous layout thrashing (forced reflow)
      window.requestAnimationFrame(() => {
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 250;
        if (instant || isNearBottom) {
          el.scrollTop = el.scrollHeight;
        }
      });
    }
  }, []);

  // Force scroll to bottom once history finishes loading
  useEffect(() => {
    if (!historyLoaded) return;
    const timer = setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [historyLoaded]);

  // Debounce scroll triggers slightly during fast AI streaming deltas
  useEffect(() => {
    if (!historyLoaded) return;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      scrollToBottom(isTyping);
    }, 16); // ~60fps frame budget
  }, [messages, isTyping, historyLoaded, scrollToBottom]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  const openCitation = useCallback(async (source?: ChatSource) => {
    if (!source) return;
    let rawUrl = source.file_url;
    if (!rawUrl && source.title) {
      try {
        const docs = await fetchDocuments();
        const found = docs.find((d) => d.title === source.title || d.title.includes(source.title) || source.title.includes(d.title));
        if (found) rawUrl = found.file_url;
      } catch {
        /* fallback */
      }
    }
    const url = buildFileUrl(rawUrl);
    if (!url) return;
    setPdfView({
      fileUrl: url,
      page: source.page_number ?? 1,
      title: source.title || "Source Document",
    });
  }, []);

  const handleFeedback = useCallback((msg: ChatMessage, rating: FeedbackRating) => {
    if (msg.feedbackGiven || !msg.dbMessageId) return;
    if (rating === "satisfied") {
      const sid = getSessionId();
      submitFeedback(msg.dbMessageId, sid, "satisfied")
        .then(() => {
          setMessages((prev) =>
            prev.map((m) => (m.id === msg.id ? { ...m, feedbackGiven: "satisfied" } : m))
          );
        })
        .catch(() => {
          /* silently fail */
        });
    } else {
      setFeedbackModal({ messageId: msg.dbMessageId });
    }
  }, [getSessionId]);

  const handleSubmitFeedback = useCallback(async (messageId: string, rating: FeedbackRating, reason?: string) => {
    await submitFeedback(messageId, getSessionId(), rating, reason);
    setMessages((prev) =>
      prev.map((m) =>
        m.dbMessageId === messageId ? { ...m, feedbackGiven: rating } : m
      )
    );
  }, [getSessionId]);

  const handleSend = useCallback(
    async (textToSend?: string) => {
      const query = (textToSend ?? input).trim();
      if (!query || isTyping) return;

      const sid = getSessionId();
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        sender: "user",
        text: query,
        timestamp: nowLabel(),
      };
      const aiMsgId = `ai-${Date.now()}`;
      const aiMsg: ChatMessage = {
        id: aiMsgId,
        sender: "ai",
        text: "",
        timestamp: nowLabel(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, aiMsg]);
      if (!textToSend) setInput("");
      setIsTyping(true);

      const controller = new AbortController();
      abortRef.current = controller;
      const partial: string[] = [];

      let lastFlush = 0;
      let flushTimer: ReturnType<typeof setTimeout> | null = null;

      const flush = () => {
        const fullText = partial.join("");
        setMessages((prev) => {
          if (!prev.length) return prev;
          const lastIdx = prev.length - 1;
          if (prev[lastIdx].id === aiMsgId) {
            const copy = [...prev];
            copy[lastIdx] = { ...copy[lastIdx], text: fullText };
            return copy;
          }
          return prev.map((m) => (m.id === aiMsgId ? { ...m, text: fullText } : m));
        });
        lastFlush = Date.now();
      };

      try {
        const result = await sendChat(
          query,
          sid,
          {
            onDelta: (delta) => {
              partial.push(delta);
              const now = Date.now();
              if (now - lastFlush > 100) {
                if (flushTimer) clearTimeout(flushTimer);
                flushTimer = null;
                flush();
              } else if (!flushTimer) {
                flushTimer = setTimeout(() => {
                  flushTimer = null;
                  flush();
                }, 100);
              }
            },
          },
          controller.signal
        );

        if (flushTimer) clearTimeout(flushTimer);

        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? {
                ...m,
                text: result.answer,
                sources: result.sources ?? [],
                cacheHit: result.cache_hit,
                costUsd: result.cost_usd,
                isStreaming: false,
                dbMessageId: result.message_id ?? undefined,
                debugTracing: result.debug_tracing ?? undefined,
              }
              : m
          )
        );
      } catch (err) {
        if (flushTimer) clearTimeout(flushTimer);
        const isAbort = (err instanceof DOMException && err.name === "AbortError") || (err as any)?.name === "AbortError";
        if (isAbort) {
          setMessages((prev) =>
            prev.map((m) => (m.id === aiMsgId ? { ...m, isStreaming: false } : m))
          );
          return;
        }
        const message = err instanceof Error ? err.message : "Request failed.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? { ...m, text: `⚠️ ${message}`, isStreaming: false }
              : m
          )
        );
      } finally {
        setIsTyping(false);
        abortRef.current = null;
      }
    },
    [input, isTyping, getSessionId]
  );

  const handleClear = () => {
    abortRef.current?.abort();
    sessionRef.current = null;
    localStorage.removeItem(SESSION_KEY);
    setPdfView(null);
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: "ai",
        text: "Chat cleared. Ask me anything about the compliance manuals.",
        timestamp: nowLabel(),
      },
    ]);
  };
  return (
    <>
      <div
        id="chatbot-container"
        className="flex flex-col lg:flex-row w-full h-[calc(100vh-140px)] min-h-[550px] animate-fade-in relative"
      >
        {/* ── Left Sidebar (User Resizable: 25% min to 60% max) ── */}
        <aside
          style={{ width: `${leftWidth}%` }}
          className="w-full shrink-0 flex flex-col h-full rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] shadow-xl overflow-hidden transition-all duration-75"
        >
          {pdfView ? (
            /* When a source or citation is clicked, show Document Citation Viewer with Back Button on the Left */
            <CitationSidePanel
              key={`${pdfView.fileUrl}:${pdfView.page}:${pdfView.documentId}`}
              fileUrl={pdfView.fileUrl}
              documentId={pdfView.documentId}
              contentType={pdfView.contentType}
              initialPage={pdfView.page}
              title={pdfView.title}
              onClose={() => setPdfView(null)}
            />
          ) : (
            /* Default: System Sources List */
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
                      {systemDocs.length} doc{systemDocs.length === 1 ? "" : "s"} across {folders.length} folder{folders.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowCreateFolderModal(true)}
                    className="p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                    title="Create New Folder"
                  >
                    <IconFolderPlus className="w-3.5 h-3.5 text-[var(--accent-primary-text)]" />
                  </button>
                  <button
                    onClick={loadSystemDocsAndFolders}
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
                    onChange={(e) => setDocFilter(e.target.value)}
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
                    const isExpanded = expandedFolders[fName] !== false; // expanded by default
                    const folderMeta = folders.find((f) => f.name === fName);

                    return (
                      <div key={fName} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 overflow-hidden">
                        {/* Folder Header */}
                        <div
                          onClick={() => toggleFolderExpand(fName)}
                          className="flex items-center justify-between px-3 py-2 bg-[var(--bg-surface)] hover:bg-[var(--accent-primary-soft)]/30 transition-colors cursor-pointer select-none group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isExpanded ? (
                              <IconChevronDown className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" />
                            ) : (
                              <IconChevronRight className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" />
                            )}
                            <IconFolder className="w-4 h-4 text-[var(--accent-primary-text)] shrink-0" />
                            <span className="font-sans text-xs font-bold text-[var(--heading-color)] truncate">
                              {fName}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="font-mono bg-[var(--bg-input)] px-1.5 py-0.5 rounded text-[9px] font-bold text-[var(--text-tertiary)]">
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
                                    onClick={() => handleSelectSourceDoc(doc)}
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
                                          onChange={(e) => handleMoveDoc(doc.id, e.target.value)}
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
          )}
        </aside>

        {/* ── Resizable Drag Handle Divider ── */}
        <div
          onMouseDown={handleMouseDown}
          className="hidden lg:flex w-3 items-center justify-center cursor-col-resize group shrink-0 select-none hover:bg-[var(--accent-primary-soft)] transition-colors rounded-full mx-1"
          title="Drag left/right to resize panels (Min 25%, Max 60%)"
        >
          <div className="w-1 h-10 rounded-full bg-[var(--border-subtle)] group-hover:bg-[var(--accent-primary-text)] group-active:bg-[var(--accent-primary)] transition-colors" />
        </div>

        {/* ── Center Chat Panel (Remaining ~70-75% space) ── */}
        <div className="flex-1 min-w-0 flex flex-col h-full rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] shadow-2xl overflow-hidden">
          {/* Top Header */}
          <header className="px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3.5">
              <div className="relative p-2.5 rounded-xl bg-[var(--accent-primary-soft)] border border-[var(--accent-primary-border)] text-[var(--accent-primary-text)]">
                <IconRobot className="w-6 h-6" />
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[var(--accent-success)] border-2 border-[var(--bg-surface)] animate-pulse" />
              </div>
              <div>
                <h2 className="font-sans text-base sm:text-lg font-bold text-[var(--heading-color)] leading-snug">
                  Procurement Assistant
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleClear}
                className="icon-action p-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-danger-border)] text-[var(--text-secondary)] hover:text-[var(--accent-danger-text)] transition-all cursor-pointer"
                title="Clear chat and reset session"
                aria-label="Clear chat history"
              >
                <IconTrash className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Messages */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-6">
            {!historyLoaded ? (
              <div className="flex justify-center pt-12">
                <span className="text-xs text-[var(--text-tertiary)] animate-pulse">Loading conversation…</span>
              </div>
            ) : (
              messages.map((msg) => (
                <ChatMessageItem key={msg.id} msg={msg} onOpenCitation={openCitation} onFeedback={handleFeedback} />
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Footer Input */}
          <footer className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0">
            {messages.length <= 1 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="px-3 py-1.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary-border-hover)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent-primary-text)] transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <IconBulb className="w-3.5 h-3.5 text-[var(--accent-warning-text)] shrink-0" />
                    {s}
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (isTyping) {
                  handleStop();
                } else {
                  handleSend();
                }
              }}
              className="flex items-end gap-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-visible)] p-2 focus-within:border-[var(--accent-primary-border-focus)] focus-within:ring-2 focus-within:ring-[var(--accent-primary-ring)] transition-all"
            >
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!isTyping && input.trim()) {
                      handleSend();
                    }
                  }
                }}
                placeholder="Ask about procurement… (Shift + Enter for new line)"
                disabled={isTyping}
                aria-label="Ask Procurement Assistant"
                className="flex-1 bg-transparent px-3 py-1.5 text-sm text-[var(--heading-color)] placeholder-[var(--text-tertiary)] outline-none border-none resize-none h-[38px] min-h-[38px] max-h-36 overflow-y-auto leading-relaxed"
              />
              {isTyping ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="icon-action p-2.5 rounded-xl font-bold text-white bg-[var(--accent-danger)] hover:opacity-90 shadow-md active:scale-95 transition-all flex items-center justify-center shrink-0 cursor-pointer mb-0.5"
                  title="Stop response generation"
                  aria-label="Stop response generation"
                >
                  <IconPlayerStop className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className={`icon-action p-2.5 rounded-xl font-bold text-white transition-all flex items-center justify-center shrink-0 cursor-pointer mb-0.5 ${input.trim()
                    ? "bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] shadow-md shadow-[var(--accent-primary-shadow)] active:scale-95"
                    : "bg-[var(--accent-neutral-bg)] text-[var(--accent-neutral-text)] cursor-not-allowed"
                    }`}
                  title="Send message (Enter)"
                  aria-label="Send message"
                >
                  <IconSend className="w-4 h-4" />
                </button>
              )}
            </form>
          </footer>
        </div>
      </div>

      {feedbackModal && (
        <FeedbackModal
          messageId={feedbackModal.messageId}
          onClose={() => setFeedbackModal(null)}
          onSubmit={handleSubmitFeedback}
        />
      )}

      {showCreateFolderModal && (
        <CreateFolderModal
          onClose={() => setShowCreateFolderModal(false)}
          onConfirm={async (name) => {
            await createFolder(name);
            loadSystemDocsAndFolders();
          }}
        />
      )}
    </>
  );
}

function CreateFolderModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(name.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create folder.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] p-5 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)]">
              <IconFolderPlus className="w-4 h-4" />
            </div>
            <h3 className="font-sans text-sm font-bold text-[var(--heading-color)]">Create New Folder</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-surface-hover)] transition-colors"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <p className="text-xs font-medium text-rose-400 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
            ⚠️ {error}
          </p>
        )}

        <input
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") onClose();
          }}
          placeholder="e.g. Safety Manuals, QA Checklists"
          className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--heading-color)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--accent-primary-border)] shadow-xs"
        />

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || submitting}
            className="px-4 py-1.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-xs font-bold text-white shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {submitting ? <IconLoader2 className="w-3.5 h-3.5 animate-spin" /> : "Create Folder"}
          </button>
        </div>
      </div>
    </div>
  );
}
