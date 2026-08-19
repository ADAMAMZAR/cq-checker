import { RoleInfo, FeatureInfo, RolesAndFeaturesResponse } from "@/types";
import { fetchRolesAndFeatures } from "./api";

export const DEFAULT_ROLES: RoleInfo[] = [
  {
    name: "admin",
    display_name: "Admin",
    description: "Full system access including admin console.",
    feature_ids: ["strategic_insights", "procurement_assistant", "supplier_visibility", "certificate_checker", "e_auction_generator"],
    test_user: "admin@gmail.com",
  },
  {
    name: "manager",
    display_name: "Manager",
    description: "Strategic sourcing oversight (Features 1, 2, 3, 5).",
    feature_ids: ["strategic_insights", "procurement_assistant", "supplier_visibility", "e_auction_generator"],
    test_user: "manager@gmail.com",
  },
  {
    name: "gpo",
    display_name: "GPO",
    description: "GPO operations team (Features 2, 3, 4, 5).",
    feature_ids: ["procurement_assistant", "supplier_visibility", "certificate_checker", "e_auction_generator"],
    test_user: "gpo@gmail.com",
  },
  {
    name: "gpo_lead",
    display_name: "GPO Lead",
    description: "GPO management, all features.",
    feature_ids: ["strategic_insights", "procurement_assistant", "supplier_visibility", "certificate_checker", "e_auction_generator"],
    test_user: "gpolead@gmail.com",
  },
  {
    name: "user",
    display_name: "User",
    description: "Standard user access (Features 2, 3, 5).",
    feature_ids: ["procurement_assistant", "supplier_visibility", "e_auction_generator"],
    test_user: "user@gmail.com",
  },
];

export const STORAGE_KEY = "gpo_active_role_name";
export const ROLE_CHANGED_EVENT = "gpo-role-changed";

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

export function getStoredRoleName(): string {
  if (typeof window === "undefined") return "admin";
  return localStorage.getItem(STORAGE_KEY) || "admin";
}

export function setStoredRoleName(roleName: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, roleName);
  window.dispatchEvent(new CustomEvent(ROLE_CHANGED_EVENT, { detail: { roleName } }));
}

export function getRoleByName(roleName: string, customRoles?: RoleInfo[]): RoleInfo {
  const roles = customRoles && customRoles.length > 0 ? customRoles : DEFAULT_ROLES;
  const found = roles.find((r) => r.name === roleName);
  return found || DEFAULT_ROLES[0];
}

export function isFeatureAllowedForRole(featureId: string, roleName: string, customRoles?: RoleInfo[]): boolean {
  if (roleName === "all") return true;
  const role = getRoleByName(roleName, customRoles);
  const normId = normalizeFeatureId(featureId);
  return role.feature_ids.some((fid) => normalizeFeatureId(fid) === normId);
}
