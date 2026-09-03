"use client";

import { useState, useEffect, useRef } from "react";
import { IconWorld, IconChevronDown, IconCheck } from "@tabler/icons-react";
import {
  SUPPORTED_LOCALES,
  SupportedLocale,
  getStoredLocale,
  setStoredLocale,
  LANGUAGE_CHANGED_EVENT,
} from "@/lib/i18nStore";

export default function LanguageDropdown() {
  const [activeLocale, setActiveLocale] = useState<SupportedLocale>(getStoredLocale());
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveLocale(getStoredLocale());

    const handleLocaleChanged = (e: Event) => {
      const customEv = e as CustomEvent;
      if (customEv.detail?.locale) {
        setActiveLocale(customEv.detail.locale);
      }
    };

    window.addEventListener(LANGUAGE_CHANGED_EVENT, handleLocaleChanged);
    return () => window.removeEventListener(LANGUAGE_CHANGED_EVENT, handleLocaleChanged);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentOption = SUPPORTED_LOCALES.find((l) => l.code === activeLocale) || SUPPORTED_LOCALES[0];

  const handleSelectLocale = (locale: SupportedLocale) => {
    setStoredLocale(locale);
    setActiveLocale(locale);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border-visible)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--heading-color)] hover:border-[var(--accent-primary-border)] text-xs font-semibold transition-all cursor-pointer shadow-sm"
        title="Select Language"
        aria-label="Select Language"
      >
        <IconWorld className="w-3.5 h-3.5 text-[var(--accent-primary-text)]" />
        <span className="font-mono text-xs">{currentOption.flag}</span>
        <span className="hidden sm:inline font-sans">{currentOption.nativeName}</span>
        <IconChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl border border-[var(--border-visible)] bg-[var(--bg-card-solid)] p-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] border-b border-[var(--border-subtle)] mb-1">
            Language
          </div>
          <div className="space-y-0.5">
            {SUPPORTED_LOCALES.map((option) => {
              const isSelected = option.code === activeLocale;
              return (
                <button
                  key={option.code}
                  type="button"
                  onClick={() => handleSelectLocale(option.code)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${isSelected
                      ? "bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] font-semibold"
                      : "hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)]"
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{option.flag}</span>
                    <span className="font-sans text-xs">{option.nativeName}</span>
                  </div>
                  {isSelected && <IconCheck className="w-3.5 h-3.5 text-[var(--accent-primary-text)]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
