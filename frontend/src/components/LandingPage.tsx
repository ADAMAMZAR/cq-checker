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
import dynamic from "next/dynamic";
import HeroBanner from "./hero/HeroBanner";
import PortalFeatureCard from "./cards/PortalFeatureCard";

const RestrictedAccessModal = dynamic(() => import("./modals/RestrictedAccessModal"), { ssr: false });

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

  // Filter features based on RBAC role permissions (Hide restricted features directly)
  const visibleFeatures = useMemo(() => {
    return PORTAL_FEATURES.filter((item) =>
      isFeatureAllowedForRole(item.id, activeRoleName, roles)
    );
  }, [activeRoleName, roles]);

  const getGridColsClass = (count: number) => {
    if (count >= 5) return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5";
    if (count === 4) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
    if (count === 3) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
    if (count === 2) return "grid-cols-1 md:grid-cols-2";
    return "grid-cols-1";
  };

  const handleSelectFeature = (item: PortalModule) => {
    if (!item.isExternal && item.routePath) {
      router.push(item.routePath);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-6 animate-fade-in w-full pb-10">
      {/* Hero Banner Section */}
      <HeroBanner />

      {/* Dynamic Grid of Allowed Portal Modules (Full Width Layout) */}
      <section className={`w-full grid gap-4 sm:gap-6 ${getGridColsClass(visibleFeatures.length)}`}>
        {visibleFeatures.map((item) => (
          <PortalFeatureCard
            key={item.id}
            item={item}
            isAllowed={true}
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