"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  IconRobot,
  IconTrash,
  IconBulb,
  IconPlayerStop,
  IconSend,
} from "@tabler/icons-react";
import {
  sendChat,
  fetchChatHistory,
  fetchDocuments,
  buildFileUrl,
  submitFeedback,
  fetchFolders,
  createFolder,
  moveDocumentFolder,
} from "@/lib/api";
import type { ChatSource, FeedbackRating, DocumentSummary, DocumentFolder } from "@/types";

// Modular Sub-components & Hooks
import type { ChatbotProps, ChatMessage, PdfViewItem } from "./chatbot/types";
import { nowLabel } from "./chatbot/utils/citationFormatter";
import { useResizableSidebar } from "./chatbot/hooks/useResizableSidebar";
import ChatMessageItem from "./chatbot/messages/ChatMessageItem";
import DocumentSidebar from "./chatbot/sidebar/DocumentSidebar";

const CreateFolderModal = dynamic(() => import("./chatbot/modals/CreateFolderModal"), { ssr: false });
const FeedbackModal = dynamic(() => import("./chatbot/modals/FeedbackModal"), { ssr: false });
const CitationSidePanel = dynamic(() => import("@/components/CitationSidePanel"), { ssr: false });

const SESSION_KEY = "cq_chat_session";
const SUGGESTIONS = [
  "Summarize the safety manual requirements",
  "What are the QA checklist items?",
  "List key compliance steps for suppliers",
];

export default function Chatbot({ onGoHome }: ChatbotProps = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [pdfView, setPdfView] = useState<PdfViewItem | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState<{ messageId: string } | null>(null);

  const [systemDocs, setSystemDocs] = useState<DocumentSummary[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [docFilter, setDocFilter] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);

  const { leftWidth, handleMouseDown } = useResizableSidebar(28, 25, 60);

  const sessionRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const loadSystemDocsAndFolders = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const [docs, fList] = await Promise.all([fetchDocuments(), fetchFolders()]);
      setSystemDocs(docs);
      setFolders(fList);
    } catch (err: unknown) {
      console.error("Failed to load system documents/folders:", err);
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  useEffect(() => {
    loadSystemDocsAndFolders();
  }, [loadSystemDocsAndFolders]);

  const handleMoveDoc = async (docId: string, folderId: string) => {
    try {
      await moveDocumentFolder(docId, folderId || null);
      loadSystemDocsAndFolders();
    } catch (err: unknown) {
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
      snippet: src.snippet,
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
      contentType: (doc as Record<string, unknown>).content_type as string | undefined || "",
    });
  }, []);

  // Load conversation history for the persisted session on first mount.
  useEffect(() => {
    const sid = getSessionId();
    fetchChatHistory(sid)
      .then((res) => {
        if (!res.messages?.length) return;
        setMessages(
          res.messages.map((m: {
            role: string;
            created_at?: string;
            content: string;
            sources?: ChatSource[];
            id?: string;
            feedback_rating?: FeedbackRating;
          }) => ({
            id: `${m.role}-${m.created_at ?? Date.now()}`,
            sender: m.role === "user" ? "user" : "ai",
            text: m.content,
            sources: m.sources ?? [],
            timestamp: m.created_at
              ? new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : nowLabel(),
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
      window.requestAnimationFrame(() => {
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 250;
        if (instant || isNearBottom) {
          el.scrollTop = el.scrollHeight;
        }
      });
    }
  }, []);

  useEffect(() => {
    if (!historyLoaded) return;
    const timer = setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [historyLoaded]);

  useEffect(() => {
    if (!historyLoaded) return;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      scrollToBottom(isTyping);
    }, 16);
  }, [messages, isTyping, historyLoaded, scrollToBottom]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
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
      } catch (err: unknown) {
        if (flushTimer) clearTimeout(flushTimer);
        const isAbort =
          (err instanceof DOMException && err.name === "AbortError") ||
          (err as { name?: string })?.name === "AbortError";
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
            <CitationSidePanel
              key={`${pdfView.fileUrl}:${pdfView.page}:${pdfView.documentId}:${pdfView.snippet?.slice(0, 20)}`}
              fileUrl={pdfView.fileUrl}
              documentId={pdfView.documentId}
              contentType={pdfView.contentType}
              initialPage={pdfView.page}
              snippet={pdfView.snippet}
              title={pdfView.title}
              onClose={() => setPdfView(null)}
            />
          ) : (
            <DocumentSidebar
              systemDocs={systemDocs}
              folders={folders}
              loadingDocs={loadingDocs}
              docFilter={docFilter}
              onFilterChange={setDocFilter}
              expandedFolders={expandedFolders}
              onToggleFolderExpand={toggleFolderExpand}
              folderGroupedDocs={folderGroupedDocs}
              onCreateFolderClick={() => setShowCreateFolderModal(true)}
              onRefreshDocs={loadSystemDocsAndFolders}
              onSelectDoc={handleSelectSourceDoc}
              onMoveDoc={handleMoveDoc}
            />
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

        {/* ── Center Chat Panel ── */}
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

          {/* Messages Stream Container */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-6">
            {!historyLoaded ? (
              <div className="flex justify-center pt-12">
                <span className="text-xs text-[var(--text-tertiary)] animate-pulse">Loading conversation…</span>
              </div>
            ) : (
              messages.map((msg) => (
                <ChatMessageItem
                  key={msg.id}
                  msg={msg}
                  onOpenCitation={handleOpenCitation}
                  onFeedback={handleFeedback}
                />
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Footer Input Form */}
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
                  className={`icon-action p-2.5 rounded-xl font-bold text-white transition-all flex items-center justify-center shrink-0 cursor-pointer mb-0.5 ${
                    input.trim()
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
