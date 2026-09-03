"use client";

import { useState, useEffect, useRef } from "react";
import {
  IconShieldCheck,
  IconChevronDown,
  IconCheck,
  IconUser,
  IconAlertTriangle,
} from "@tabler/icons-react";
import {
  getStoredUserEmail,
  setStoredUserEmail,
  isAuthorizedDomain,
  DEFAULT_AUTHORIZED_EMAIL,
  DEMO_UNAUTHORIZED_EMAIL,
  SECURITY_EMAIL_CHANGED_EVENT,
} from "@/lib/securityStore";

export default function SecurityGateToggle() {
  const [email, setEmail] = useState<string>(DEFAULT_AUTHORIZED_EMAIL);
  const [isOpen, setIsOpen] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEmail(getStoredUserEmail());

    const handleEmailChanged = (e: Event) => {
      const customEv = e as CustomEvent;
      if (customEv.detail?.email) {
        setEmail(customEv.detail.email);
      }
    };

    window.addEventListener(SECURITY_EMAIL_CHANGED_EVENT, handleEmailChanged);
    return () => window.removeEventListener(SECURITY_EMAIL_CHANGED_EVENT, handleEmailChanged);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isAllowed = isAuthorizedDomain(email);

  const handleSelectEmail = (newEmail: string) => {
    setStoredUserEmail(newEmail);
    setEmail(newEmail);
    setIsOpen(false);
    // Reload page to re-trigger initial fetch requests with new security identity
    window.location.reload();
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customInput.trim()) {
      handleSelectEmail(customInput.trim());
      setCustomInput("");
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all shadow-sm ${isAllowed
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
          : "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/20"
          }`}
        title="Simulate Security Gate Identity (@gamuda.com.my Domain Restriction)"
      >
        <span className="font-mono text-[11px] truncate max-w-[150px] sm:max-w-[200px]">
          {email}
        </span>
        <span
          className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider ${isAllowed
            ? "text-emerald-700"
            : "text-red-700"
            }`}
        >
          {isAllowed ? "Allowed" : "Blocked"}
        </span>
        <IconChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border border-[var(--border-visible)] bg-[var(--bg-card-solid)] p-3 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="space-y-1.5 mb-3">
            <button
              type="button"
              onClick={() => handleSelectEmail(DEFAULT_AUTHORIZED_EMAIL)}
              className={`w-full flex items-center justify-between p-2 rounded-lg text-xs transition-colors ${email === DEFAULT_AUTHORIZED_EMAIL
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-500/30"
                : "bg-[var(--bg-card)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)]"
                }`}
            >
              <div className="flex items-center gap-2">
                <IconShieldCheck className="w-4 h-4 text-emerald-500" />
                <div className="text-left">
                  <div className="font-mono text-[11px] font-semibold">{DEFAULT_AUTHORIZED_EMAIL}</div>
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400">Internal Employee (HTTP 200 OK)</div>
                </div>
              </div>
              {email === DEFAULT_AUTHORIZED_EMAIL && <IconCheck className="w-4 h-4 text-emerald-500" />}
            </button>

            <button
              type="button"
              onClick={() => handleSelectEmail(DEMO_UNAUTHORIZED_EMAIL)}
              className={`w-full flex items-center justify-between p-2 rounded-lg text-xs transition-colors ${email === DEMO_UNAUTHORIZED_EMAIL
                ? "bg-red-500/15 text-red-700 dark:text-red-300 font-semibold border border-red-500/30"
                : "bg-[var(--bg-card)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)]"
                }`}
            >
              <div className="flex items-center gap-2">
                <IconAlertTriangle className="w-4 h-4 text-red-500" />
                <div className="text-left">
                  <div className="font-mono text-[11px] font-semibold">{DEMO_UNAUTHORIZED_EMAIL}</div>
                  <div className="text-[10px] text-red-600 dark:text-red-400">External Domain (HTTP 403 Forbidden)</div>
                </div>
              </div>
              {email === DEMO_UNAUTHORIZED_EMAIL && <IconCheck className="w-4 h-4 text-red-500" />}
            </button>
          </div>

          <form onSubmit={handleCustomSubmit} className="pt-2 border-t border-[var(--border-subtle)]">
            <label className="block text-[10px] font-medium text-[var(--text-secondary)] mb-1">
              Custom Email Identity:
            </label>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <IconUser className="w-3.5 h-3.5 absolute left-2 top-2 text-[var(--text-tertiary)]" />
                <input
                  type="email"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="e.g. user@other.com"
                  className="w-full pl-7 pr-2 py-1 text-xs rounded-md bg-[var(--bg-card)] border border-[var(--border-visible)] text-[var(--text-primary)] focus:outline-none focus:border-emerald-500"
                />
              </div>
              <button
                type="submit"
                className="px-2.5 py-1 rounded-md bg-[var(--accent-primary-soft)] hover:bg-[var(--accent-primary-border)] text-[var(--accent-primary-text)] font-semibold text-xs"
              >
                Apply
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
