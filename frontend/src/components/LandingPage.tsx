"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  isFeatureAllowedForRole,
  DEFAULT_ROLES,
  fetchRolesAndFeaturesCached,
  mergeRoles,
} from "@/lib/roleStore";
import { RoleInfo } from "@/types";
import { PORTAL_FEATURES, PortalModule } from "@/config/portalFeatures";
import dynamic from "next/dynamic";
import HeroBanner from "./hero/HeroBanner";
import PortalFeatureCard from "./cards/PortalFeatureCard";
import { useAuth } from "@/context/AuthContext";

const RestrictedAccessModal = dynamic(() => import("./modals/RestrictedAccessModal"), { ssr: false });

export default function LandingPage() {
  const router = useRouter();
  const { session } = useAuth();

  const [roles, setRoles] = useState<RoleInfo[]>(DEFAULT_ROLES);
  const [restrictedModalItem, setRestrictedModalItem] = useState<PortalModule | null>(null);

  const userRoles = useMemo(() => {
    return session?.roles && session.roles.length > 0 ? session.roles : ["user"];
  }, [session]);

  useEffect(() => {
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
  }, []);

  // Filter features based on live SSO RBAC role permissions
  const visibleFeatures = useMemo(() => {
    return PORTAL_FEATURES.filter((item) =>
      isFeatureAllowedForRole(item.id, userRoles, roles)
    );
  }, [userRoles, roles]);

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
      <section className={`w-full grid gap-4 sm:gap-6 pt-10 ${getGridColsClass(visibleFeatures.length)}`}>
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