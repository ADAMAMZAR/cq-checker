import type {
  DbTableMeta,
  DbTableData,
  RolesAndFeaturesResponse,
} from "@/types";

import { getStoredUserEmail, setStoredUserEmail } from "./securityStore";

// ── Base API Configuration ───────────────────────────────────────────────────

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://127.0.0.1:8000/api"
    : "/api");

export const UPLOAD_API_BASE = API_BASE;

const INTERNAL_SECRET = process.env.NEXT_PUBLIC_INTERNAL_API_SECRET || "dev-internal-secret-cq-checker";

// ── Custom Error Classes ──────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Session expired or unauthorized. Please sign in.") {
    super(401, "Unauthorized", message);
    this.name = "UnauthorizedError";
  }
}

export async function errorDetail(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data.detail === "string") return data.detail;
    if (data.detail) return JSON.stringify(data.detail);
    if (typeof data.message === "string") return data.message;
    return JSON.stringify(data);
  } catch {
    return `HTTP ${res.status}: ${res.statusText || "Request failed"}`;
  }
}

// ── Authentication & Network Interceptors ───────────────────────────────────

export function getAuthHeaders(extraHeaders: HeadersInit = {}): HeadersInit {
  const headers = new Headers(extraHeaders);
  if (INTERNAL_SECRET) {
    headers.set("X-Internal-Secret", INTERNAL_SECRET);
  }
  const userEmail = getStoredUserEmail();
  if (userEmail) {
    headers.set("X-User-Email", userEmail);
  }
  return headers;
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = getAuthHeaders(init.headers);
  const res = await fetch(input, { credentials: "include", cache: "no-store", ...init, headers });

  if (res.status === 401) {
    console.warn("API request returned 401 Unauthorized:", input);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("gpo-unauthorized-session-event"));
    }
  }

  if (res.status === 403 && typeof window !== "undefined") {
    res
      .clone()
      .json()
      .then((data) => {
        if (data?.provided_email) {
          setStoredUserEmail(data.provided_email);
        }
      })
      .catch((err) => {
        console.debug("Failed to extract provided_email from 403 response:", err);
      });
  }

  return res;
}

export async function fetchDbTables(): Promise<DbTableMeta[]> {
  const res = await authFetch(`${API_BASE}/db/tables`);
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function fetchDbTable(
  table: string,
  limit: number = 100,
  offset: number = 0,
  search?: string
): Promise<DbTableData> {
  const qParam = search ? `&q=${encodeURIComponent(search)}` : "";
  const res = await authFetch(
    `${API_BASE}/db/tables/${encodeURIComponent(table)}?limit=${limit}&offset=${offset}${qParam}`
  );
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function deleteDbRow(table: string, pk: Record<string, string>): Promise<void> {
  const res = await authFetch(`${API_BASE}/db/tables/${encodeURIComponent(table)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pk }),
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
}

export async function updateDbCell(
  table: string,
  pk: Record<string, string>,
  column: string,
  value: string
): Promise<void> {
  const res = await authFetch(`${API_BASE}/db/tables/${encodeURIComponent(table)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pk, column, value }),
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
}

export async function fetchRolesAndFeatures(): Promise<RolesAndFeaturesResponse> {
  try {
    const res = await authFetch(`${API_BASE}/v1/auth/roles`);
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn("Primary endpoint /v1/auth/roles failed, trying fallback:", err);
  }
  const res = await authFetch(`${API_BASE}/auth/roles`);
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

// ── Admin User Management ───────────────────────────────────────────────────

export interface AdminUserItem {
  id: string;
  email: string;
  display_name?: string;
  roles: string[];
  sso_subject?: string | null;
  sso_provider?: string | null;
  is_active: boolean;
  last_login_at?: string | null;
  created_at?: string | null;
  status: string;
}

export interface AdminUsersResponse {
  users: AdminUserItem[];
  available_roles: Array<{ id: string; name: string; display_name: string }>;
}

export async function fetchAdminUsers(): Promise<AdminUsersResponse> {
  const res = await authFetch(`${API_BASE}/admin/users`);
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function createAdminUser(
  email: string,
  roles: string[],
  displayName?: string
): Promise<{ status: string; message: string; user_id?: string }> {
  const res = await authFetch(`${API_BASE}/admin/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, roles, display_name: displayName }),
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function updateAdminUserRoles(
  userId: string,
  roles: string[]
): Promise<{ status: string; message: string }> {
  const res = await authFetch(`${API_BASE}/admin/users/${encodeURIComponent(userId)}/roles`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roles }),
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}

export async function deleteAdminUser(userId: string): Promise<{ status: string; message: string }> {
  const res = await authFetch(`${API_BASE}/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText, await errorDetail(res));
  return res.json();
}