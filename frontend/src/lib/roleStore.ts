import { RoleInfo, RolesAndFeaturesResponse } from "@/types";
import { fetchRolesAndFeatures } from "./api";

export const DEFAULT_ROLES: RoleInfo[] = [
  {
    name: "admin",
    display_name: "Admin",
    description: "Full system access including admin console.",
    feature_ids: ["strategic_insights", "procurement_assistant", "supplier_visibility", "certificate_checker", "e_auction_generator"],
  },
  {
    name: "manager",
    display_name: "Manager",
    description: "Strategic sourcing oversight (Features 1, 2, 3, 5).",
    feature_ids: ["strategic_insights", "procurement_assistant", "supplier_visibility"],
  },
  {
    name: "gpo",
    display_name: "GPO",
    description: "GPO operations team (Features 2, 3, 4, 5).",
    feature_ids: ["procurement_assistant", "supplier_visibility", "certificate_checker", "e_auction_generator"],
  },
  {
    name: "gpo_admin",
    display_name: "GPO Admin",
    description: "GPO management, all features.",
    feature_ids: ["strategic_insights", "procurement_assistant", "supplier_visibility", "certificate_checker", "e_auction_generator"],
  },
  {
    name: "user",
    display_name: "User",
    description: "Standard user access (Features 2, 3, 5).",
    feature_ids: ["procurement_assistant", "supplier_visibility", "e_auction_generator"],
  },
];

export function mergeRoles(backendRoles: RoleInfo[]): RoleInfo[] {
  const map = new Map<string, RoleInfo>();
  for (const r of DEFAULT_ROLES) {
    map.set(r.name, r);
  }
  for (const r of backendRoles) {
    map.set(r.name, { ...r, feature_ids: r.feature_ids || [] });
  }
  return Array.from(map.values());
}

const ROLES_CACHE_KEY = "gpo_cached_roles_and_features_v1";
// Cache in browser localStorage for 60 minutes (1 hour) to eliminate repeated network calls across tabs and reloads
const ROLES_CACHE_TTL_MS = 60 * 60 * 1000;

let cachedRolesResponse: RolesAndFeaturesResponse | null = null;
let pendingRolesFetch: Promise<RolesAndFeaturesResponse> | null = null;

export async function fetchRolesAndFeaturesCached(): Promise<RolesAndFeaturesResponse> {
  // 1. In-memory check (fastest, 0ms)
  if (cachedRolesResponse) return cachedRolesResponse;

  // 2. Browser localStorage check with TTL (persists across page reloads & tabs)
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(ROLES_CACHE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { timestamp: number; data: RolesAndFeaturesResponse };
        if (parsed.timestamp && Date.now() - parsed.timestamp < ROLES_CACHE_TTL_MS && parsed.data) {
          cachedRolesResponse = parsed.data;
          return parsed.data;
        }
      }
    } catch {
      // Ignore localStorage read errors (e.g. private browsing)
    }
  }

  // 3. In-flight request deduplication
  if (pendingRolesFetch) return pendingRolesFetch;

  // 4. Fetch from backend only if not cached or TTL expired
  pendingRolesFetch = fetchRolesAndFeatures()
    .then((res) => {
      cachedRolesResponse = res;
      pendingRolesFetch = null;
      if (typeof window !== "undefined" && res) {
        try {
          localStorage.setItem(
            ROLES_CACHE_KEY,
            JSON.stringify({ timestamp: Date.now(), data: res })
          );
        } catch {
          // Ignore localStorage write quota errors
        }
      }
      return res;
    })
    .catch((err) => {
      pendingRolesFetch = null;
      throw err;
    });

  return pendingRolesFetch;
}

export function clearRolesCache(): void {
  cachedRolesResponse = null;
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(ROLES_CACHE_KEY);
    } catch {
      // Ignore
    }
  }
}

export function normalizeFeatureId(id: string): string {
  return id.replace(/-/g, "_").toLowerCase();
}

export function getRoleByName(roleName: string, customRoles?: RoleInfo[]): RoleInfo {
  const roles = customRoles && customRoles.length > 0 ? customRoles : DEFAULT_ROLES;
  const found = roles.find((r) => r.name === roleName);
  return found || DEFAULT_ROLES[0];
}

export function isFeatureAllowedForRole(featureId: string, roleNameOrRoles: string | string[], customRoles?: RoleInfo[]): boolean {
  const rolesList = Array.isArray(roleNameOrRoles) ? roleNameOrRoles : [roleNameOrRoles];
  if (rolesList.includes("admin") || rolesList.includes("gpo_admin") || rolesList.includes("all")) return true;

  const normId = normalizeFeatureId(featureId);
  const roles = customRoles && customRoles.length > 0 ? customRoles : DEFAULT_ROLES;

  for (const rName of rolesList) {
    const foundRole = roles.find((r) => r.name === rName);
    if (foundRole && foundRole.feature_ids.some((fid) => normalizeFeatureId(fid) === normId)) {
      return true;
    }
  }
  return false;
}
