"use client";

import { useState, useRef, useEffect } from "react";
import {
  IconRobot,
  IconSend,
  IconUser,
  IconSparkles,
  IconTrash,
  IconCopy,
  IconCheck,
  IconShieldCheck,
  IconBulb,
  IconBuildingStore,
  IconFileText,
  IconAlertCircle,
  IconRefresh,
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
  const [messages, setMessages] = useState<Message[]>([
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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
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
          <div className="relative p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <IconRobot className="w-6 h-6" />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[var(--bg-surface)] animate-pulse" />
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 text-xs font-semibold transition-all cursor-pointer"
              title="Return to Main Portal"
            >
              <IconArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Portal</span>
            </button>
          )}
          <button
            onClick={handleClearChat}
            className="p-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-rose-500/40 text-[var(--text-secondary)] hover:text-rose-400 transition-all cursor-pointer"
            title="Clear Chat History"
          >
            <IconTrash className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── Chat Messages Container ── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-6 space-y-2 scrollbar-thin">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-3 max-w-3xl ${msg.sender === "user" ? "self-end flex-row-reverse" : "self-start"
              }`}
          >
            {/* Avatar */}
            <div
              className={`p-2 rounded-xl shrink-0 border ${msg.sender === "user"
                ? "bg-blue-600 border-blue-400 text-white"
                : "bg-blue-500/10 border-blue-500/20 text-blue-400"
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
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : msg.statusBadge.type === "warning"
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                      }`}
                  >
                    {msg.statusBadge.label}
                  </span>
                )}
              </div>

              {/* Message Bubble */}
              <div
                className={`p-4 rounded-2xl text-sm leading-relaxed ${msg.sender === "user"
                  ? "bg-blue-600 text-white rounded-tr-none shadow-lg"
                  : "bg-[var(--bg-surface)] border border-[var(--border-visible)] text-[var(--heading-color)] rounded-tl-none shadow-md"
                  }`}
              >
                {/* Formatted Markdown text rendering */}
                <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap font-sans">
                  {msg.text}
                </div>
              </div>

              {/* Suggested Follow-up Prompts */}
              {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2 max-w-xl">
                  {msg.suggestedActions.map((action, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(action)}
                      className="px-3 py-1.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-blue-500/40 text-xs font-medium text-[var(--text-secondary)] hover:text-blue-400 transition-all text-left cursor-pointer active:scale-95 flex items-center gap-1.5 shadow-sm"
                    >
                      <IconBulb className="w-3.5 h-3.5 text-amber-400 shrink-0" />
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
          <div className="flex items-start gap-3 self-start max-w-xl animate-pulse">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0">
              <IconRobot className="w-5 h-5 animate-spin" />
            </div>
            <div className="p-4 rounded-2xl rounded-tl-none bg-[var(--bg-surface)] border border-[var(--border-visible)] text-xs text-[var(--text-secondary)] flex items-center gap-2">
              <span className="font-semibold text-blue-400">Autonomous Assistant is analyzing GPO database...</span>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "300ms" }} />
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
          <div className="relative flex items-center gap-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-visible)] p-2 focus-within:border-blue-500/60 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask GPO AI"
              disabled={isTyping}
              className="flex-1 bg-transparent px-3 py-2 text-sm text-[var(--heading-color)] placeholder-[var(--text-tertiary)] outline-none border-none"
            />

            {/* Send Button only — No Upload File option */}
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className={`p-2.5 rounded-xl font-bold text-white transition-all flex items-center justify-center shrink-0 cursor-pointer ${input.trim() && !isTyping
                ? "bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/30 active:scale-95"
                : "bg-gray-700/50 text-gray-500 cursor-not-allowed"
                }`}
              title="Send Message"
            >
              <IconSend className="w-4 h-4" />
            </button>
          </div>
        </form>
      </footer>
    </div>
  );
}
