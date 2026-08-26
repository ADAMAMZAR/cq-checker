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

let cachedRolesResponse: RolesAndFeaturesResponse | null = null;
let pendingRolesFetch: Promise<RolesAndFeaturesResponse> | null = null;

export async function fetchRolesAndFeaturesCached(): Promise<RolesAndFeaturesResponse> {
  if (cachedRolesResponse) return cachedRolesResponse;
  if (pendingRolesFetch) return pendingRolesFetch;

  pendingRolesFetch = fetchRolesAndFeatures()
    .then((res) => {
      cachedRolesResponse = res;
      pendingRolesFetch = null;
      return res;
    })
    .catch((err) => {
      pendingRolesFetch = null;
      throw err;
    });

  return pendingRolesFetch;
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
