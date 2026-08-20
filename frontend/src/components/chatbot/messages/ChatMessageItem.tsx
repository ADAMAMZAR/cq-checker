"use client";

import { useState, useMemo, useCallback, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  IconUser,
  IconRobot,
  IconCopy,
  IconCheck,
  IconThumbUp,
  IconThumbDown,
  IconFileText,
} from "@tabler/icons-react";
import type { ChatSource } from "@/types";
import type { ChatMessageItemProps } from "../types";
import { formatCitationLinks } from "../utils/citationFormatter";

const REMARK_PLUGINS = [remarkGfm];

const ChatMessageItem = memo(function ChatMessageItem({
  msg,
  onOpenCitation,
  onFeedback,
}: ChatMessageItemProps) {
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
      ol({ children, ...props }: React.ComponentPropsWithoutRef<"ol">) {
        return (
          <ol className="list-decimal pl-6 my-2 space-y-1.5 text-left font-normal" {...props}>
            {children}
          </ol>
        );
      },
      ul({ children, ...props }: React.ComponentPropsWithoutRef<"ul">) {
        return (
          <ul className="list-disc pl-6 my-2 space-y-1.5 text-left font-normal" {...props}>
            {children}
          </ul>
        );
      },
      li({ children, ...props }: React.ComponentPropsWithoutRef<"li">) {
        return (
          <li className="pl-1 leading-relaxed" {...props}>
            {children}
          </li>
        );
      },
      a({ href, children, ...props }: React.ComponentPropsWithoutRef<"a">) {
        if (href?.startsWith("#cite-")) {
          const num = parseInt(href.replace("#cite-", ""), 10);
          let src = msg.sources?.[num - 1];
          if (!src && msg.sources && msg.sources.length > 0) {
            src = msg.sources.find((s) => s.page_number === num) || msg.sources[0];
          }
          if (!src) return <span>{children}</span>;

          return (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenCitation(src);
              }}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] font-bold text-[11px] hover:bg-[var(--accent-primary-hover)] hover:text-white transition-all border border-[var(--accent-primary-border)] cursor-pointer mx-0.5 font-mono"
              title={`${src.title || "Source"} — Page ${src.page_number ?? num}`}
            >
              {children}
            </button>
          );
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-primary-text)] underline hover:text-[var(--accent-primary-hover)] font-medium"
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
    <div
      className={`flex items-start gap-3 max-w-3xl ${
        msg.sender === "user" ? "self-end flex-row-reverse" : "self-start"
      }`}
    >
      {/* Avatar */}
      <div
        className={`p-2 rounded-xl shrink-0 border ${
          msg.sender === "user"
            ? "bg-[var(--accent-primary)] border-[var(--accent-primary-border-strong)] text-white"
            : "bg-[var(--accent-primary-soft)] border-[var(--accent-primary-border)] text-[var(--accent-primary-text)]"
        }`}
      >
        {msg.sender === "user" ? <IconUser className="w-5 h-5" /> : <IconRobot className="w-5 h-5" />}
      </div>

      <div className={`flex flex-col gap-2 ${msg.sender === "user" ? "items-end" : "items-start"}`}>
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-tertiary)] px-1">
          <span className="font-semibold">
            {msg.sender === "user" ? "You" : "Procurement Assistant"}
          </span>
        </div>

        <div
          className={`p-4 rounded-2xl text-sm leading-relaxed ${
            msg.sender === "user"
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
                <span
                  className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary-text)] typing-dot"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary-text)] typing-dot"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary-text)] typing-dot"
                  style={{ animationDelay: "300ms" }}
                />
              </span>
            </div>
          ) : (
            <div className="prose prose-sm max-w-none font-sans">
              <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={markdownComponents}>
                {formattedText}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Source Badges and Feedback Buttons */}
        {msg.sender === "ai" && !msg.isStreaming && (
          <div className="flex flex-wrap items-center gap-2 mt-1 px-1">
            {msg.sources && msg.sources.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                  Sources:
                </span>
                {msg.sources.map((src, i) => (
                  <button
                    key={`${src.document_id ?? i}-${i}`}
                    onClick={() => onOpenCitation(src)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary-border)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--accent-primary-text)] transition-all cursor-pointer shadow-xs"
                  >
                    <IconFileText className="w-3 h-3 text-[var(--accent-primary-text)]" />
                    <span className="truncate max-w-[120px]">{src.title || "Document"}</span>
                    {src.page_number && (
                      <span className="font-mono text-[9px] text-[var(--text-tertiary)]">
                        p.{src.page_number}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={handleCopy}
                className="p-1 rounded-md hover:bg-[var(--bg-surface-hover)] text-[var(--text-tertiary)] hover:text-[var(--heading-color)] transition-colors cursor-pointer"
                title="Copy response"
                aria-label="Copy response"
              >
                {copied ? (
                  <IconCheck className="w-3.5 h-3.5 text-[var(--match-text)]" />
                ) : (
                  <IconCopy className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                onClick={() => onFeedback(msg, "satisfied")}
                disabled={!!msg.feedbackGiven}
                className={`p-1 rounded-md transition-colors cursor-pointer ${
                  msg.feedbackGiven === "satisfied"
                    ? "bg-[var(--match-bg)] text-[var(--match-text)]"
                    : "hover:bg-[var(--bg-surface-hover)] text-[var(--text-tertiary)] hover:text-[var(--match-text)]"
                }`}
                title="Helpful response"
                aria-label="Mark response as helpful"
              >
                <IconThumbUp className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => onFeedback(msg, "not_satisfied")}
                disabled={!!msg.feedbackGiven}
                className={`p-1 rounded-md transition-colors cursor-pointer ${
                  msg.feedbackGiven === "not_satisfied"
                    ? "bg-[var(--mismatch-bg)] text-[var(--mismatch-text)]"
                    : "hover:bg-[var(--bg-surface-hover)] text-[var(--text-tertiary)] hover:text-[var(--mismatch-text)]"
                }`}
                title="Unhelpful response"
                aria-label="Mark response as unhelpful"
              >
                <IconThumbDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default ChatMessageItem;
