import { setStoredUserEmail } from "./securityStore";

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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const SESSION_INDICATOR_COOKIE = "cq_logged_in";

/**
 * Check if the indicator cookie exists in the browser.
 */
export function hasSessionIndicator(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((c) => c.trim().startsWith(`${SESSION_INDICATOR_COOKIE}=`));
}

/**
 * Manually delete the indicator cookie in the frontend.
 */
export function clearSessionIndicator(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_INDICATOR_COOKIE}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

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
      clearSessionIndicator();
      return { authenticated: false, user: null };
    }

    const data: AuthMeResponse = await response.json();
    if (!data.authenticated) {
      clearSessionIndicator();
    }
    return data;
  } catch (error) {
    console.error("Failed to verify session:", error);
    return { authenticated: false, user: null };
  }
}

/**
 * Logout current session and redirect to Entra ID end-session URL.
 */
export async function logoutFromEntra(): Promise<void> {
  clearSessionIndicator();
  setStoredUserEmail("");
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
