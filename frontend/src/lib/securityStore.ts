export const SECURITY_EMAIL_KEY = "cq_demo_security_email";
export const SECURITY_EMAIL_CHANGED_EVENT = "cq_demo_security_email_changed";

export const DEFAULT_AUTHORIZED_EMAIL = "adam@gamuda.com.my";
export const DEMO_UNAUTHORIZED_EMAIL = "outsider@gmail.com";

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

export function isAuthorizedDomain(email: string): boolean {
  if (!email || !email.trim()) return false;
  return email.trim().toLowerCase().endsWith("@gamuda.com.my");
}
