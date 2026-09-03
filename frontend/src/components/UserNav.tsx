"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  IconBrandWindows,
  IconLogout,
  IconLoader2,
  IconChevronDown,
  IconSettings,
  IconWorld,
  IconSun,
  IconMoon,
  IconX,
  IconCheck,
} from "@tabler/icons-react";
import { checkAuthSession, loginWithEntra, logoutFromEntra, UserSession } from "@/lib/auth";
import { setStoredUserEmail } from "@/lib/securityStore";
import {
  SUPPORTED_LOCALES,
  SupportedLocale,
  getStoredLocale,
  setStoredLocale,
  LANGUAGE_CHANGED_EVENT,
} from "@/lib/i18nStore";
import { useTheme } from "./ThemeProvider";
import { useAuth } from "@/context/AuthContext";

export default function UserNav() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { session, isAuthenticated, loading } = useAuth();

  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [showLanguageModal, setShowLanguageModal] = useState<boolean>(false);
  const [showThemeModal, setShowThemeModal] = useState<boolean>(false);

  const [activeLocale, setActiveLocale] = useState<SupportedLocale>(getStoredLocale());

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleLocaleChanged = (e: Event) => {
      const customEv = e as CustomEvent;
      if (customEv.detail?.locale) {
        setActiveLocale(customEv.detail.locale);
      }
    };

    window.addEventListener(LANGUAGE_CHANGED_EVENT, handleLocaleChanged);
    return () => {
      window.removeEventListener(LANGUAGE_CHANGED_EVENT, handleLocaleChanged);
    };
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-xs font-medium shadow-sm">
        <IconLoader2 className="w-4 h-4 animate-spin text-[var(--accent-primary-text)]" />
        <span>Checking auth...</span>
      </div>
    );
  }

  if (!isAuthenticated || !session) {
    return (
      <button
        type="button"
        onClick={loginWithEntra}
        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-[#0078d4]/40 bg-[#0078d4]/10 hover:bg-[#0078d4]/20 text-[#0078d4] dark:text-[#50e6ff] text-xs font-semibold transition-all shadow-sm cursor-pointer"
        title="Sign in with corporate Microsoft Entra ID"
      >
        <IconBrandWindows className="w-4 h-4" />
        <span>Sign in with Microsoft</span>
      </button>
    );
  }

  const primaryRole = session.roles?.[0] || "user";
  const isAdmin = session.roles?.some((r) => ["admin", "gpo_admin", "all"].includes(r)) ?? false;

  const currentLocaleObj =
    SUPPORTED_LOCALES.find((l) => l.code === activeLocale) || SUPPORTED_LOCALES[0];

  const handleSelectLocale = (code: SupportedLocale) => {
    setStoredLocale(code);
    setActiveLocale(code);
    setShowLanguageModal(false);
  };

  const handleSelectTheme = (newTheme: "dark" | "light") => {
    setTheme(newTheme);
    setShowThemeModal(false);
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Profile Trigger Pill */}
      <button
        type="button"
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--border-visible)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-card)] text-[var(--heading-color)] text-xs font-semibold shadow-sm hover:border-[var(--accent-primary-border)] transition-all cursor-pointer group"
        aria-expanded={isDropdownOpen}
      >
        <div className="flex flex-col items-start text-left leading-tight">
          <span className="text-xs font-bold text-[var(--heading-color)] group-hover:text-[var(--accent-primary-text)] transition-colors truncate max-w-[120px] sm:max-w-[150px]">
            {session.display_name || session.email}
          </span>
        </div>
        <IconChevronDown
          className={`w-3.5 h-3.5 text-[var(--text-secondary)] transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""
            }`}
        />
      </button>

      {/* Main Unified Dropdown Menu */}
      {isDropdownOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card-solid)] shadow-2xl overflow-hidden animate-fade-in divide-y divide-[var(--border-subtle)] z-50">
          {/* Header Info */}
          <div className="p-3.5 bg-[var(--bg-elevated)] flex items-center gap-3">
            <div className="overflow-hidden leading-tight">
              <h4 className="text-xs font-bold text-[var(--heading-color)] truncate">
                {session.display_name || "Gamuda Employee"}
              </h4>
              <p className="text-[11px] text-[var(--text-secondary)] truncate font-mono">
                {session.email}
              </p>
            </div>
          </div>

          {/* Menu Actions */}
          <div className="p-1.5 space-y-0.5">
            {/* Admin Console Option (Conditional) */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setIsDropdownOpen(false);
                  router.push("/admin");
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-[var(--heading-color)] hover:bg-[var(--accent-primary-soft)] hover:text-[var(--accent-primary-text)] transition-colors cursor-pointer"
              >
                <IconSettings className="w-4 h-4 text-[var(--accent-primary-text)]" />
                <div className="text-left flex-1">
                  <div>Admin Console</div>
                </div>
              </button>
            )}

            {/* Language Option */}
            <button
              type="button"
              onClick={() => {
                setIsDropdownOpen(false);
                setShowLanguageModal(true);
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-[var(--heading-color)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <IconWorld className="w-4 h-4 text-[var(--text-secondary)]" />
                <span>Language</span>
              </div>
              <span className="text-[11px] font-medium text-[var(--text-tertiary)] flex items-center gap-1 bg-[var(--bg-elevated)] px-2 py-0.5 rounded-lg border border-[var(--border-subtle)]">
                <span>{currentLocaleObj.flag}</span>
                <span>{currentLocaleObj.nativeName}</span>
              </span>
            </button>

            {/* Theme Option */}
            <button
              type="button"
              onClick={() => {
                setIsDropdownOpen(false);
                setShowThemeModal(true);
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-[var(--heading-color)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                {theme === "dark" ? (
                  <IconMoon className="w-4 h-4 text-purple-400" />
                ) : (
                  <IconSun className="w-4 h-4 text-amber-500" />
                )}
                <span>Theme</span>
              </div>
              <span className="text-[11px] font-medium text-[var(--text-tertiary)] capitalize bg-[var(--bg-elevated)] px-2 py-0.5 rounded-lg border border-[var(--border-subtle)]">
                {theme} Mode
              </span>
            </button>
          </div>

          {/* Sign Out Option */}
          <div className="p-1.5">
            <button
              type="button"
              onClick={() => {
                setIsDropdownOpen(false);
                logoutFromEntra();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              <IconLogout className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}

      {/* Language Selection Modal */}
      {showLanguageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
          <div className="relative w-full max-w-sm rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card-solid)] p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2">
                <IconWorld className="w-5 h-5 text-[var(--accent-primary-text)]" />
                <h3 className="font-sans text-sm font-bold text-[var(--heading-color)]">
                  Select Language
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLanguageModal(false)}
                className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-elevated)] transition-colors"
              >
                <IconX className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              {SUPPORTED_LOCALES.map((option) => {
                const isSelected = option.code === activeLocale;
                return (
                  <button
                    key={option.code}
                    type="button"
                    onClick={() => handleSelectLocale(option.code)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs transition-colors cursor-pointer ${isSelected
                      ? "bg-[var(--accent-primary-soft)] border-[var(--accent-primary-border)] text-[var(--heading-color)] font-bold shadow-xs"
                      : "bg-[var(--bg-elevated)] border-transparent hover:border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--heading-color)]"
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-base">{option.flag}</span>
                      <div className="text-left">
                        <div className="font-semibold text-xs">{option.nativeName}</div>
                        <div className="text-[10px] text-[var(--text-tertiary)]">{option.name}</div>
                      </div>
                    </div>
                    {isSelected && (
                      <IconCheck className="w-4 h-4 text-[var(--accent-primary-text)]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Theme Selection Modal */}
      {showThemeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
          <div className="relative w-full max-w-sm rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card-solid)] p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2">
                <IconSun className="w-5 h-5 text-[var(--accent-primary-text)]" />
                <h3 className="font-sans text-sm font-bold text-[var(--heading-color)]">
                  Appearance Theme
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowThemeModal(false)}
                className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-elevated)] transition-colors"
              >
                <IconX className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleSelectTheme("dark")}
                className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-xs transition-colors cursor-pointer ${theme === "dark"
                  ? "bg-[var(--accent-primary-soft)] border-[var(--accent-primary-border)] text-[var(--heading-color)] font-bold shadow-xs"
                  : "bg-[var(--bg-elevated)] border-transparent hover:border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--heading-color)]"
                  }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    <IconMoon className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-xs">Dark Theme</div>
                    <div className="text-[10px] font-normal text-[var(--text-tertiary)]">
                      Sleek dark design for low light
                    </div>
                  </div>
                </div>
                {theme === "dark" && (
                  <IconCheck className="w-4 h-4 text-[var(--accent-primary-text)]" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSelectTheme("light")}
                className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-xs transition-colors cursor-pointer ${theme === "light"
                  ? "bg-[var(--accent-primary-soft)] border-[var(--accent-primary-border)] text-[var(--heading-color)] font-bold shadow-xs"
                  : "bg-[var(--bg-elevated)] border-transparent hover:border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--heading-color)]"
                  }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    <IconSun className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-xs">Light Theme</div>
                    <div className="text-[10px] font-normal text-[var(--text-tertiary)]">
                      Clean light design for bright environments
                    </div>
                  </div>
                </div>
                {theme === "light" && (
                  <IconCheck className="w-4 h-4 text-[var(--accent-primary-text)]" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
