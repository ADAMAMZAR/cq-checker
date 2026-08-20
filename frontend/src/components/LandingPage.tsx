"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  getStoredRoleName,
  isFeatureAllowedForRole,
  ROLE_CHANGED_EVENT,
  DEFAULT_ROLES,
  fetchRolesAndFeaturesCached,
  mergeRoles,
} from "@/lib/roleStore";
import { RoleInfo } from "@/types";
import { PORTAL_FEATURES, PortalModule } from "@/config/portalFeatures";
import HeroBanner from "./hero/HeroBanner";
import PortalFeatureCard from "./cards/PortalFeatureCard";
import RestrictedAccessModal from "./modals/RestrictedAccessModal";

export default function LandingPage() {
  const router = useRouter();

  const [activeRoleName, setActiveRoleName] = useState<string>("all");
  const [roles, setRoles] = useState<RoleInfo[]>(DEFAULT_ROLES);
  const [restrictedModalItem, setRestrictedModalItem] = useState<PortalModule | null>(null);

  useEffect(() => {
    setActiveRoleName(getStoredRoleName());

    async function loadRoles() {
      try {
        const res = await fetchRolesAndFeaturesCached();
        if (res?.roles && res.roles.length > 0) {
          setRoles(mergeRoles(res.roles));
        }
      } catch {
        // Fallback to static default roles
      }
    }
    loadRoles();

    const handleRoleChange = (e: Event) => {
      const customEv = e as CustomEvent;
      if (customEv.detail?.roleName) {
        setActiveRoleName(customEv.detail.roleName);
      }
    };

    window.addEventListener(ROLE_CHANGED_EVENT, handleRoleChange);
    return () => window.removeEventListener(ROLE_CHANGED_EVENT, handleRoleChange);
  }, []);

  // Performance Optimization: Compute allowed features set once per role/roles change
  const allowedFeatureIds = useMemo(() => {
    return new Set(
      PORTAL_FEATURES.filter((item) =>
        isFeatureAllowedForRole(item.id, activeRoleName, roles)
      ).map((item) => item.id)
    );
  }, [activeRoleName, roles]);

  const handleSelectFeature = (item: PortalModule) => {
    const isAllowed = allowedFeatureIds.has(item.id);
    if (!isAllowed) {
      setRestrictedModalItem(item);
      return;
    }

    if (!item.isExternal && item.routePath) {
      router.push(item.routePath);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-6 animate-fade-in w-full pb-10">
      {/* Hero Banner Section */}
      <HeroBanner />

      {/* Grid of Portal Modules */}
      <section className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6">
        {PORTAL_FEATURES.map((item) => (
          <PortalFeatureCard
            key={item.id}
            item={item}
            isAllowed={allowedFeatureIds.has(item.id)}
            onSelect={handleSelectFeature}
          />
        ))}
      </section>

      {/* Restricted Access Modal */}
      {restrictedModalItem && (
        <RestrictedAccessModal
          item={restrictedModalItem}
          onClose={() => setRestrictedModalItem(null)}
        />
      )}
    </div>
  );
}