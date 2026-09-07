export const SECURITY_EMAIL_KEY = "gpo_sso_user_email";
export const SECURITY_EMAIL_CHANGED_EVENT = "gpo_sso_user_email_changed";
export const SECURITY_SESSION_KEY = "gpo_sso_cached_session_v1";

// Cache session in browser for 15 minutes to eliminate redundant /auth/me network calls
export const SESSION_CACHE_TTL_MS = 15 * 60 * 1000;

export interface CachedUserSession {
  id: string;
  email: string;
  display_name: string;
  roles: string[];
  is_active?: boolean;
  last_login_at?: string | null;
}

export interface StoredSessionPayload {
  user: CachedUserSession;
  cachedAt: number;
}

export function getStoredUserEmail(): string {
  if (typeof window === "undefined") return "";
  try {
    const val = localStorage.getItem(SECURITY_EMAIL_KEY);
    return val && val.trim() ? val.trim() : "";
  } catch {
    return "";
  }
}

export function setStoredUserEmail(email: string): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = email.trim();
    localStorage.setItem(SECURITY_EMAIL_KEY, trimmed);
    window.dispatchEvent(
      new CustomEvent(SECURITY_EMAIL_CHANGED_EVENT, {
        detail: { email: trimmed },
      })
    );
  } catch (err) {
    console.error("Failed to store security email:", err);
  }
}

/**
 * Retrieve cached user session and check if it is still within the fresh TTL window.
 */
export function getStoredUserSession(): { user: CachedUserSession; isFresh: boolean } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SECURITY_SESSION_KEY);
    if (!raw) return null;
    const parsed: StoredSessionPayload = JSON.parse(raw);
    if (!parsed || !parsed.user || !parsed.user.email) return null;
    const age = Date.now() - (parsed.cachedAt || 0);
    const isFresh = age < SESSION_CACHE_TTL_MS;
    return { user: parsed.user, isFresh };
  } catch {
    return null;
  }
}

/**
 * Persist user session to localStorage with a fresh timestamp.
 */
export function setStoredUserSession(user: CachedUserSession): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredSessionPayload = {
      user,
      cachedAt: Date.now(),
    };
    localStorage.setItem(SECURITY_SESSION_KEY, JSON.stringify(payload));
    setStoredUserEmail(user.email);
  } catch (err) {
    console.error("Failed to store user session cache:", err);
  }
}

/**
 * Clear cached user session and email from localStorage.
 */
export function clearStoredUserSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SECURITY_SESSION_KEY);
  } catch {}
  setStoredUserEmail("");
}

export function isAuthorizedDomain(email: string): boolean {
  if (!email || !email.trim()) return false;
  return email.trim().toLowerCase().endsWith("@gamuda.com.my");
}

