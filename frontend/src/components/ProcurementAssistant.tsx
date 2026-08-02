"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  IconRobot,
  IconSend,
  IconUser,
  IconTrash,
  IconBulb,
  IconArrowLeft,
} from "@tabler/icons-react";

interface ProcurementAssistantProps {
  onGoHome?: () => void;
}

interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
  suggestedActions?: string[];
  statusBadge?: {
    type: "success" | "warning" | "info";
    label: string;
  };
}

const INITIAL_SUGGESTIONS = [
  "📋 Check Vendor Onboarding status for Gamuda Engineering suppliers",
  "🛡️ Audit CIDB & ISO certificate validity across all active vendors",
  "📊 Summarize Q3 procurement cost savings and risk metrics",
  "⚠️ List non-compliant suppliers requiring immediate audit renewal",
];

export default function ProcurementAssistant({ onGoHome }: ProcurementAssistantProps = {}) {
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: "welcome-1",
      sender: "ai",
      text: "Hello! I am your **Autonomous Procurement Assistant**, integrated with the Gamuda Group Procurement Office (GPO) database and SAP Ariba workflows.\n\nHow can I assist you today with vendor onboarding, compliance validation, or procurement analytics?",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      suggestedActions: INITIAL_SUGGESTIONS,
      statusBadge: {
        type: "info",
        label: "SAP Ariba System Connected",
      },
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    const reduceMotion = typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    chatEndRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = (textToSend?: string) => {
    const query = textToSend || input.trim();
    if (!query || isTyping) return;

    const userTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: query,
      timestamp: userTime,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");
    setIsTyping(true);

    // Simulate AI thinking and response generation
    setTimeout(() => {
      const aiTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const lowerQuery = query.toLowerCase();
      let aiResponseText = "";
      let statusBadge: Message["statusBadge"] = undefined;
      let suggestedActions: string[] | undefined = undefined;

      if (lowerQuery.includes("onboard") || lowerQuery.includes("vendor") || lowerQuery.includes("supplier")) {
        aiResponseText = `### 🏢 Vendor Onboarding Audit Summary\n\nI have cross-checked active vendor records against the SAP Ariba database:\n\n- **Total Vendors Evaluated**: 142 Active Suppliers\n- **Fully Onboarded & Verified**: 128 (90.1% Compliance Rate)\n- **Pending Evidence Upload**: 9 Vendors\n- **Flagged / Action Needed**: 5 Vendors\n\n#### Key Findings:\n1. **MMC Gamuda KVMRT**: All ISO & CIDB certificates valid until Dec 2026.\n2. **Bina Puri Holdings**: Safety audit pending re-submission.\n\nWould you like me to trigger automated email reminders for the 5 flagged suppliers?`;
        statusBadge = { type: "success", label: "Registry Synced" };
        suggestedActions = [
          "📩 Trigger email reminders for 5 flagged suppliers",
          "📄 View detailed audit logs for Bina Puri Holdings",
          "🔍 Export full vendor compliance breakdown",
        ];
      } else if (lowerQuery.includes("cidb") || lowerQuery.includes("iso") || lowerQuery.includes("certificate") || lowerQuery.includes("audit")) {
        aiResponseText = `### 🛡️ Certificate Validity & Compliance Report\n\nHere is the real-time status of supplier certificates in the GPO Registry:\n\n* **CIDB Grade G7**: 88% Verified | 12% Expiring within 30 days\n* **ISO 9001:2015**: 94% Compliant\n* **ISO 45001 (OH&S)**: 89% Compliant\n\n> ⚠️ **Attention Required**: 3 suppliers have expired CIDB licenses. Automated hold applied to pending PO approvals.`;
        statusBadge = { type: "warning", label: "3 Action Items Flagged" };
        suggestedActions = [
          "🔒 Review PO holds for expired CIDB suppliers",
          "📋 Open Supplier Data Editor module",
        ];
      } else if (lowerQuery.includes("cost") || lowerQuery.includes("sav") || lowerQuery.includes("budget") || lowerQuery.includes("financial")) {
        aiResponseText = `### 📊 GPO Cost Impact & Savings Overview\n\nBased on Q3 Procurement Analytics:\n\n* **Total Savings Realized**: RM 4,250,000\n* **Automated Cost Optimization**: 12.4% reduction in material sourcing overhead\n* **High-Impact Categories**: Steel & Rebar Sourcing, Heavy Equipment Rental\n\nAll pricing benchmarks remain aligned with Gamuda Procurement Committee guidelines.`;
        statusBadge = { type: "info", label: "Executive Analytics Live" };
        suggestedActions = [
          "📈 Open Strategic Insights PowerBI Dashboard",
          "💡 Compare steel sourcing cost trends",
        ];
      } else {
        aiResponseText = `I have received your request regarding **"${query}"**.\n\nAs the GPO Autonomous Assistant, I am continuously monitoring vendor records, SAP Ariba sourcing events, and certificate registry compliance. \n\nHow else can I assist you with GPO operations or supplier verification today?`;
        suggestedActions = INITIAL_SUGGESTIONS.slice(0, 3);
      }

      const aiMsg: Message = {
        id: `ai-${Date.now()}`,
        sender: "ai",
        text: aiResponseText,
        timestamp: aiTime,
        statusBadge,
        suggestedActions,
      };

      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, 1000);
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: "ai",
        text: "Chat cleared. How else can I assist you with Gamuda Group Procurement Office workflows?",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        suggestedActions: INITIAL_SUGGESTIONS,
      },
    ]);
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-140px)] min-h-[550px] max-w-6xl mx-auto w-full rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] shadow-2xl backdrop-blur-2xl overflow-hidden animate-fade-in">
      {/* ── Top Header ── */}
      <header className="px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="relative p-2.5 rounded-xl bg-[var(--accent-primary-soft)] border border-[var(--accent-primary-border)] text-[var(--accent-primary-text)]">
            <IconRobot className="w-6 h-6" />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[var(--accent-success)] border-2 border-[var(--bg-surface)] animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-sans text-base sm:text-lg font-bold text-[var(--heading-color)] leading-snug">
                Autonomous Procurement Assistant
              </h2>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onGoHome && (
            <button
              onClick={onGoHome}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--accent-primary-soft)] border border-[var(--accent-primary-border)] text-[var(--accent-primary-text)] hover:bg-[var(--accent-primary-soft-strong)] text-xs font-semibold transition-all cursor-pointer"
              title="Return to Main Portal"
            >
              <IconArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Portal</span>
            </button>
          )}
          <button
            onClick={handleClearChat}
            className="icon-action p-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-danger-border)] text-[var(--text-secondary)] hover:text-[var(--accent-danger-text)] transition-all cursor-pointer"
            title="Clear Chat History"
            aria-label="Clear chat history"
          >
            <IconTrash className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── Chat Messages Container ── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-6 space-y-2">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-3 max-w-3xl ${msg.sender === "user" ? "self-end flex-row-reverse" : "self-start"
              }`}
          >
            {/* Avatar */}
            <div
              className={`p-2 rounded-xl shrink-0 border ${msg.sender === "user"
                ? "bg-[var(--accent-primary)] border-[var(--accent-primary-border-strong)] text-white"
                : "bg-[var(--accent-primary-soft)] border-[var(--accent-primary-border)] text-[var(--accent-primary-text)]"
                }`}
            >
              {msg.sender === "user" ? (
                <IconUser className="w-5 h-5" />
              ) : (
                <IconRobot className="w-5 h-5" />
              )}
            </div>

            {/* Content Box */}
            <div className={`flex flex-col gap-2 ${msg.sender === "user" ? "items-end" : "items-start"}`}>
              {/* Sender Name & Time */}
              <div className="flex items-center gap-2 text-[11px] text-[var(--text-tertiary)] px-1">
                <span className="font-semibold">
                  {msg.sender === "user" ? "You" : "GPO AI"}
                </span>
                <span>{msg.timestamp}</span>
                {msg.statusBadge && (
                  <span
                    className={`ml-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${msg.statusBadge.type === "success"
                      ? "bg-[var(--accent-success-soft)] text-[var(--accent-success-text)] border-[var(--accent-success-border)]"
                      : msg.statusBadge.type === "warning"
                        ? "bg-[var(--accent-warning-soft)] text-[var(--accent-warning-text)] border-[var(--accent-warning-border)]"
                        : "bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border-[var(--accent-primary-border)]"
                      }`}
                  >
                    {msg.statusBadge.label}
                  </span>
                )}
              </div>

              {/* Message Bubble */}
              <div
                className={`p-4 rounded-2xl text-sm leading-relaxed ${msg.sender === "user"
                  ? "bg-[var(--accent-primary)] text-white rounded-tr-none shadow-lg"
                  : "bg-[var(--bg-surface)] border border-[var(--border-visible)] text-[var(--heading-color)] rounded-tl-none shadow-md"
                  }`}
              >
                {msg.sender === "user" ? (
                  <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                ) : (
                  <div className="prose prose-sm max-w-none font-sans">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                  </div>
                )}
              </div>

              {/* Suggested Follow-up Prompts */}
              {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2 max-w-xl">
                  {msg.suggestedActions.map((action, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(action)}
                      className="px-3 py-1.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary-border-hover)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent-primary-text)] transition-all text-left cursor-pointer active:scale-95 flex items-center gap-1.5 shadow-sm"
                    >
                      <IconBulb className="w-3.5 h-3.5 text-[var(--accent-warning-text)] shrink-0" />
                      <span>{action}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Typing Indicator */}
        {isTyping && (
          <div className="flex items-start gap-3 self-start max-w-xl">
            <div className="p-2 rounded-xl bg-[var(--accent-primary-soft)] border border-[var(--accent-primary-border)] text-[var(--accent-primary-text)] shrink-0">
              <IconRobot className="w-5 h-5 animate-spin" />
            </div>
            <div className="p-4 rounded-2xl rounded-tl-none bg-[var(--bg-surface)] border border-[var(--border-visible)] text-xs text-[var(--text-secondary)] flex items-center gap-2">
              <span className="font-semibold text-[var(--accent-primary-text)]">Autonomous Assistant is analyzing GPO database...</span>
              <div className="flex items-center gap-1" aria-hidden="true">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary-text)] typing-dot" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary-text)] typing-dot" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary-text)] typing-dot" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* ── Bottom Input Section (No file upload) ── */}
      <footer className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex flex-col gap-2"
        >
          <div className="relative flex items-center gap-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-visible)] p-2 focus-within:border-[var(--accent-primary-border-focus)] focus-within:ring-2 focus-within:ring-[var(--accent-primary-ring)] transition-all">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask GPO AI"
              disabled={isTyping}
              aria-label="Ask GPO AI"
              className="flex-1 bg-transparent px-3 py-2 text-sm text-[var(--heading-color)] placeholder-[var(--text-tertiary)] outline-none border-none"
            />

            {/* Send Button only — No Upload File option */}
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className={`icon-action p-2.5 rounded-xl font-bold text-white transition-all flex items-center justify-center shrink-0 cursor-pointer ${input.trim() && !isTyping
                ? "bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] shadow-md shadow-[var(--accent-primary-shadow)] active:scale-95"
                : "bg-[var(--accent-neutral-bg)] text-[var(--accent-neutral-text)] cursor-not-allowed"
                }`}
              title="Send Message"
              aria-label="Send message"
            >
              <IconSend className="w-4 h-4" />
            </button>
          </div>
        </form>
      </footer>
    </div>
  );
}
