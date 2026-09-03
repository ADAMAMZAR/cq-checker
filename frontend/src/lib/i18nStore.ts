export type SupportedLocale = "en" | "ms" | "zh-TW" | "vi";

export interface LocaleOption {
  code: SupportedLocale;
  name: string;
  nativeName: string;
  flag: string;
}

export const SUPPORTED_LOCALES: LocaleOption[] = [
  { code: "en", name: "English", nativeName: "English", flag: "🇬🇧" },
  { code: "ms", name: "Malay", nativeName: "Bahasa Melayu", flag: "🇲🇾" },
  { code: "zh-TW", name: "Traditional Chinese", nativeName: "繁體中文", flag: "🇹🇼" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", flag: "🇻🇳" },
];

export const DEFAULT_LOCALE: SupportedLocale = "en";
export const LANGUAGE_STORAGE_KEY = "cq_user_language";
export const LANGUAGE_CHANGED_EVENT = "cq-language-changed";

export function getStoredLocale(): SupportedLocale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const val = localStorage.getItem(LANGUAGE_STORAGE_KEY) as SupportedLocale;
    if (val && SUPPORTED_LOCALES.some((l) => l.code === val)) {
      return val;
    }
  } catch {
    // fallback
  }
  return DEFAULT_LOCALE;
}

export function setStoredLocale(locale: SupportedLocale): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, locale);
    window.dispatchEvent(
      new CustomEvent(LANGUAGE_CHANGED_EVENT, {
        detail: { locale },
      })
    );
  } catch (err) {
    console.error("Failed to save language preference:", err);
  }
}
