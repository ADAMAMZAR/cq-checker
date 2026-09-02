/** Frontend authentication client for Microsoft Entra ID SSO. */

export interface UserSession {
  id: string;
  email: string;
  display_name: string;
  roles: string[];
  is_active?: boolean;
  last_login_at?: string | null;
}

export interface AuthMeResponse {
  authenticated: boolean;
  user: UserSession | null;
}

import { clearRolesCache } from "./roleStore";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Redirect browser to backend Microsoft Entra ID login endpoint.
 */
export function loginWithEntra(): void {
  window.location.href = `${API_BASE_URL}/auth/login`;
}

/**
 * Check current authentication session status with backend.
 */
export async function checkAuthSession(): Promise<AuthMeResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
    });

    if (!response.ok) {
      return { authenticated: false, user: null };
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to verify session:", error);
    return { authenticated: false, user: null };
  }
}

/**
 * Logout current session and redirect to Entra ID end-session URL.
 */
export async function logoutFromEntra(): Promise<void> {
  clearRolesCache();
  try {
    const response = await fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
    });

    if (response.ok) {
      const data = await response.json();
      if (data.logout_url) {
        window.location.href = data.logout_url;
        return;
      }
    }
  } catch (error) {
    console.error("Logout request error:", error);
  }

  // Fallback redirect
  window.location.href = "/";
}
