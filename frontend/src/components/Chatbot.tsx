"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
} from "@tabler/icons-react";
import { sendChat, fetchChatHistory, fetchDocuments, buildFileUrl } from "@/lib/api";
import type { ChatSource } from "@/types";

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

export default function Chatbot({ onGoHome }: ChatbotProps = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [pdfView, setPdfView] = useState<{ fileUrl: string; page: number; title: string } | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
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
          res.messages.map((m) => ({
            id: `${m.role}-${m.created_at ?? Date.now()}`,
            sender: m.role === "user" ? "user" : "ai",
            text: m.content,
            timestamp: m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : nowLabel(),
          }))
        );
      })
      .catch(() => {
        /* history unavailable — start fresh */
      })
      .finally(() => setHistoryLoaded(true));
  }, [getSessionId]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => () => abortRef.current?.abort(), []);

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

      try {
        const result = await sendChat(
          query,
          sid,
          {
            onDelta: (delta) => {
              partial.push(delta);
              setMessages((prev) =>
                prev.map((m) => (m.id === aiMsgId ? { ...m, text: partial.join("") } : m))
              );
            },
          },
          controller.signal
        );
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
              }
              : m
          )
        );
      } catch (err) {
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

  const openCitation = async (source?: ChatSource) => {
    if (!source) return;
    let rawUrl = source.file_url;
    if (!rawUrl && source.title) {
      try {
        const docs = await fetchDocuments();
        const found = docs.find((d) => d.title === source.title || d.title.includes(source.title));
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
  };
  return (
    <Group key={pdfView ? "split" : "single"} orientation="horizontal" className="flex-1 min-h-0" id="chat-citation-panels">
      <Panel defaultSize={pdfView ? 50 : 100} minSize={30}>
        <div className="flex flex-col h-[calc(100vh-140px)] min-h-[550px] rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] shadow-2xl backdrop-blur-2xl overflow-hidden animate-fade-in">
          {/* ── Top Header ── */}
          <header className="px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3.5">
              <div className="relative p-2.5 rounded-xl bg-[var(--accent-primary-soft)] border border-[var(--accent-primary-border)] text-[var(--accent-primary-text)]">
                <IconRobot className="w-6 h-6" />
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[var(--accent-success)] border-2 border-[var(--bg-surface)] animate-pulse" />
              </div>
              <div>
                <h2 className="font-sans text-base sm:text-lg font-bold text-[var(--heading-color)] leading-snug">
                  Autonomous Procurement Assistant
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
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-6">
            {!historyLoaded ? (
              <div className="flex justify-center pt-12">
                <span className="text-xs text-[var(--text-tertiary)] animate-pulse">Loading conversation…</span>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex items-start gap-3 max-w-3xl ${msg.sender === "user" ? "self-end flex-row-reverse" : "self-start"}`}>
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
                      <span className="font-semibold">{msg.sender === "user" ? "You" : "CQ Assistant"}</span>
                      <span>{msg.timestamp}</span>
                      {msg.cacheHit && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold border bg-[var(--accent-success-soft)] text-[var(--accent-success-text)] border-[var(--accent-success-border)]">
                          CACHE HIT · $0
                        </span>
                      )}
                      {!msg.cacheHit && msg.costUsd !== undefined && msg.sender === "ai" && !msg.isStreaming && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold border bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border-[var(--accent-primary-border)]">
                          ${msg.costUsd.toFixed(6)}
                        </span>
                      )}
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
                          <span className="text-xs text-[var(--text-secondary)]">Analyzing manuals…</span>
                          <span className="flex gap-1" aria-hidden="true">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary-text)] typing-dot" style={{ animationDelay: "0ms" }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary-text)] typing-dot" style={{ animationDelay: "150ms" }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary-text)] typing-dot" style={{ animationDelay: "300ms" }} />
                          </span>
                        </div>
                      ) : (
                        <div className="prose prose-sm max-w-none font-sans">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              a({ href, children, ...props }: any) {
                                if (href?.startsWith("#cite-")) {
                                  const idx = parseInt(href.replace("#cite-", ""), 10) - 1;
                                  const src = msg.sources?.[idx];
                                  return (
                                    <button
                                      onClick={() => src && openCitation(src)}
                                      disabled={!src}
                                      className="inline-flex items-center justify-center px-1.5 py-0.5 mx-0.5 text-[10px] font-black rounded-full bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)] hover:bg-[var(--accent-primary)] hover:text-white hover:border-[var(--accent-primary-border-strong)] transition-all transform hover:scale-110 cursor-pointer shadow-xs align-middle inline-block select-none"
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
                            }}
                          >
                            {formatCitationLinks(msg.text)}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="flex flex-col gap-1.5 mt-2 max-w-2xl">
                        <span className="text-[10px] font-bold tracking-wider text-[var(--text-tertiary)] uppercase flex items-center gap-1">
                          <IconSourceCode className="w-3.5 h-3.5 text-[var(--accent-primary-text)]" /> Sources & References ({msg.sources.length})
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {msg.sources.map((src, idx) => (
                            <button
                              key={`${msg.id}-src-${idx}`}
                              onClick={() => openCitation(src)}
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
                                  p.{src.page_number}
                                </span>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
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
                aria-label="Ask CQ Assistant"
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
        <>
          <Separator className="w-1 bg-[var(--border-subtle)] hover:bg-[var(--accent-primary-border-focus)] transition-colors cursor-col-resize" />
          <Panel defaultSize={50} minSize={25}>
            <CitationSidePanel
              key={`${pdfView.fileUrl}:${pdfView.page}`}
              fileUrl={pdfView.fileUrl}
              initialPage={pdfView.page}
              title={pdfView.title}
              onClose={() => setPdfView(null)}
            />
          </Panel>
        </>
      )}
    </Group>
  );
}
