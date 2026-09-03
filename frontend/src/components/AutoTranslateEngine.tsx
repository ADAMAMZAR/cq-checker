"use client";

import { useEffect } from "react";
import { getStoredLocale, LANGUAGE_CHANGED_EVENT, SupportedLocale } from "@/lib/i18nStore";

declare global {
  interface Window {
    google: any;
    googleTranslateElementInit: any;
  }
}

export default function AutoTranslateEngine() {
  useEffect(() => {
    // 1. Initialize hidden Google Translate Element callback
    window.googleTranslateElementInit = () => {
      if (!window.google || !window.google.translate) return;
      new window.google.translate.TranslateElement(
        {
          pageLanguage: "en",
          includedLanguages: "en,ms,zh-TW,vi",
          autoDisplay: false,
        },
        "google_translate_element"
      );
    };

    // 2. Dynamically inject Google Translate script
    if (!document.getElementById("google-translate-script")) {
      const script = document.createElement("script");
      script.id = "google-translate-script";
      script.src = "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
      script.async = true;
      document.body.appendChild(script);
    }

    // 3. Helper to trigger translation change programmatically
    const triggerTranslation = (locale: SupportedLocale) => {
      const selectEl = document.querySelector(".goog-te-combo") as HTMLSelectElement;
      if (selectEl) {
        selectEl.value = locale;
        selectEl.dispatchEvent(new Event("change"));
      }
    };

    // Listen for header dropdown events
    const handleLanguageChanged = (e: Event) => {
      const customEv = e as CustomEvent;
      if (customEv.detail?.locale) {
        triggerTranslation(customEv.detail.locale);
      }
    };

    window.addEventListener(LANGUAGE_CHANGED_EVENT, handleLanguageChanged);

    // Apply stored language preference on mount
    const timer = setTimeout(() => {
      const stored = getStoredLocale();
      if (stored && stored !== "en") {
        triggerTranslation(stored);
      }
    }, 800);

    return () => {
      window.removeEventListener(LANGUAGE_CHANGED_EVENT, handleLanguageChanged);
      clearTimeout(timer);
    };
  }, []);

  return (
    <>
      <style jsx global>{`
        /* Hide Google Translate top banner & powered-by branding for clean custom UI */
        .goog-te-banner-frame,
        .skiptranslate,
        #goog-gt-tt {
          display: none !important;
        }
        body {
          top: 0px !important;
        }
        .goog-text-highlight {
          background-color: transparent !important;
          box-shadow: none !important;
        }
      `}</style>
      <div
        id="google_translate_element"
        className="hidden pointer-events-none w-0 h-0 overflow-hidden"
        style={{ display: "none" }}
      />
    </>
  );
}
