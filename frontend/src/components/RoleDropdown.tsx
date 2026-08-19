"use client";

import { useState, useEffect, useRef } from "react";
import {
  IconChevronDown,
} from "@tabler/icons-react";
import { RoleInfo } from "@/types";
import {
  DEFAULT_ROLES,
  getStoredRoleName,
  setStoredRoleName,
  ROLE_CHANGED_EVENT,
  fetchRolesAndFeaturesCached,
} from "@/lib/roleStore";

const ALL_MODULES = [
  { id: "strategic_insights", label: "Strategic Insights" },
  { id: "procurement_assistant", label: "Procurement Assistant" },
  { id: "supplier_visibility", label: "Supplier Visibility" },
  { id: "certificate_checker", label: "Certificate Checker" },
  { id: "e_auction_generator", label: "E-Auction Generator" },
];

export default function RoleDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [roles, setRoles] = useState<RoleInfo[]>(DEFAULT_ROLES);
  const [activeRoleName, setActiveRoleName] = useState<string>("admin");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveRoleName(getStoredRoleName());

    async function loadBackendRoles() {
      try {
        const res = await fetchRolesAndFeaturesCached();
        if (res?.roles && res.roles.length > 0) {
          // Keep 'all' synthetic role at top, merge backend roles
          const merged: RoleInfo[] = [
            DEFAULT_ROLES[0],
            ...res.roles.map((r) => ({
              ...r,
              feature_ids: r.feature_ids || [],
            })),
          ];
          setRoles(merged);
        }
      } catch (err) {
        console.warn("Could not fetch DB roles, using default roles:", err);
      }
    }
    loadBackendRoles();

    const handleRoleChanged = (e: Event) => {
      const customEv = e as CustomEvent;
      if (customEv.detail?.roleName) {
        setActiveRoleName(customEv.detail.roleName);
      }
    };

    window.addEventListener(ROLE_CHANGED_EVENT, handleRoleChanged);
    return () => window.removeEventListener(ROLE_CHANGED_EVENT, handleRoleChanged);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeRole = roles.find((r) => r.name === activeRoleName) || roles[0];
  const selectRole = (roleName: string) => {
    setActiveRoleName(roleName);
    setStoredRoleName(roleName);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block text-left z-50" ref={dropdownRef}>
      {/* ── Trigger Pill ── */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-visible)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-card)] text-[var(--heading-color)] text-xs font-semibold shadow-sm hover:border-[var(--accent-primary-border)] transition-all cursor-pointer group"
        title="Switch user role persona to test feature availability"
      >
        <div className="flex flex-col items-start text-left leading-none">
          <span className="text-xs font-bold text-[var(--heading-color)] group-hover:text-[var(--accent-primary-text)] transition-colors mt-0.5">
            {activeRole.display_name}
          </span>
        </div>
        <IconChevronDown className={`w-3.5 h-3.5 text-[var(--text-secondary)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-[var(--bg-card)] border border-[var(--border-visible)] shadow-2xl overflow-hidden animate-fade-in divide-y divide-[var(--border-subtle)] z-50">
          {/* Menu Header */}
          <div className="p-3 bg-[var(--bg-elevated)] flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-[var(--heading-color)]">Switch Role</h4>
            </div>
          </div>

          {/* Role Options List */}
          <div className="max-h-[380px] overflow-y-auto p-1.5 space-y-1">
            {roles.map((role) => {
              const isSelected = role.name === activeRoleName;

              return (
                <div
                  key={role.name}
                  onClick={() => selectRole(role.name)}
                  className={`p-2.5 rounded-lg border transition-all cursor-pointer ${isSelected
                    ? "bg-[var(--accent-primary-soft)] border-[var(--accent-primary-border)] shadow-sm"
                    : "bg-[var(--bg-card)] border-transparent hover:bg-[var(--bg-elevated)] hover:border-[var(--border-subtle)]"
                    }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-[var(--heading-color)]">
                            {role.display_name}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
