import { useCallback, useEffect, useRef, useState, memo, useMemo } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Group, Panel, Separator } from "react-resizable-panels";
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
  IconX,
} from "@tabler/icons-react";
import { sendChat, fetchChatHistory, fetchDocuments, buildFileUrl, submitFeedback } from "@/lib/api";
import type { ChatSource, FeedbackRating } from "@/types";

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
}

const SESSION_KEY = "cq_chat_session";
const SUGGESTIONS = [
  "Summarize the safety manual requirements",
  "What are the QA checklist items?",
  "List key compliance steps for suppliers",
];

function formatCitationLinks(text: string): string {
  if (!text) return "";
  return text.replace(/\[(\d+(?:[\s,–-]+\d+)*)\]/g, (match, p1) => {
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
  const formattedText = useMemo(() => formatCitationLinks(msg.text), [msg.text]);

  const markdownComponents = useMemo(
    () => ({
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
          <span>{msg.timestamp}</span>
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
        {msg.sender === "ai" && !msg.isStreaming && msg.dbMessageId && (
          <div className="flex items-center gap-1 mt-2">
            <button
              onClick={() => onFeedback(msg, "satisfied")}
              disabled={!!msg.feedbackGiven}
              className={`p-1.5 rounded-lg transition-all ${
                msg.feedbackGiven === "satisfied"
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
              className={`p-1.5 rounded-lg transition-all ${
                msg.feedbackGiven === "not_satisfied"
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
          </div>
        )}
      </div>
    </div>
  );
});

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
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
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                  selectedReasons.includes(reason)
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
  const [pdfView, setPdfView] = useState<{ fileUrl: string; page: number; title: string } | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState<{ messageId: string } | null>(null);
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
              }
              : m
          )
        );
      } catch (err) {
        if (flushTimer) clearTimeout(flushTimer);
        if (err instanceof DOMException && err.name === "AbortError") return;
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
    <Group orientation="horizontal" className="flex-1 min-h-0" id="chat-citation-panels">
      <Panel defaultSize={pdfView ? 50 : 100} minSize={30}>
        <div className="flex flex-col h-[calc(100vh-140px)] min-h-[550px] rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] shadow-2xl overflow-hidden animate-fade-in">
          {/* ── Top Header ── */}
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
          {/* ── Messages ── */}
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
                handleSend();
              }}
              className="flex items-center gap-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-visible)] p-2 focus-within:border-[var(--accent-primary-border-focus)] focus-within:ring-2 focus-within:ring-[var(--accent-primary-ring)] transition-all"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about the manuals…"
                disabled={isTyping}
                aria-label="Ask Procurement Assistant"
                className="flex-1 bg-transparent px-3 py-2 text-sm text-[var(--heading-color)] placeholder-[var(--text-tertiary)] outline-none border-none"
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                className={`icon-action p-2.5 rounded-xl font-bold text-white transition-all flex items-center justify-center shrink-0 cursor-pointer ${input.trim() && !isTyping
                  ? "bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] shadow-md shadow-[var(--accent-primary-shadow)] active:scale-95"
                  : "bg-[var(--accent-neutral-bg)] text-[var(--accent-neutral-text)] cursor-not-allowed"
                  }`}
                title="Send message"
                aria-label="Send message"
              >
                <IconSend className="w-4 h-4" />
              </button>
            </form>
          </footer>
        </div>
      </Panel>
      {pdfView && (
        <Separator className="w-1 bg-[var(--border-subtle)] hover:bg-[var(--accent-primary-border-focus)] transition-colors cursor-col-resize" />
      )}
      {pdfView && (
        <Panel defaultSize={50} minSize={25}>
          <CitationSidePanel
            key={`${pdfView.fileUrl}:${pdfView.page}`}
            fileUrl={pdfView.fileUrl}
            initialPage={pdfView.page}
            title={pdfView.title}
            onClose={() => setPdfView(null)}
          />
        </Panel>
      )}
    </Group>
    {feedbackModal && (
      <FeedbackModal
        messageId={feedbackModal.messageId}
        onClose={() => setFeedbackModal(null)}
        onSubmit={handleSubmitFeedback}
      />
    )}
  </>
  );
}
