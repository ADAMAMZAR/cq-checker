"use client";

import { useState, useEffect, createContext, useContext } from "react";
import {
  SupportedLocale,
  getStoredLocale,
  LANGUAGE_CHANGED_EVENT,
} from "@/lib/i18nStore";

import enMessages from "@/messages/en.json";
import msMessages from "@/messages/ms.json";
import zhTwMessages from "@/messages/zh-TW.json";
import viMessages from "@/messages/vi.json";

const messagesMap: Record<SupportedLocale, any> = {
  en: enMessages,
  ms: msMessages,
  "zh-TW": zhTwMessages,
  vi: viMessages,
};

const I18nContext = createContext<{
  locale: SupportedLocale;
  messages: any;
}>({
  locale: "en",
  messages: enMessages,
});

export default function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<SupportedLocale>(getStoredLocale());

  useEffect(() => {
    setLocale(getStoredLocale());

    const handleLocaleChanged = (e: Event) => {
      const customEv = e as CustomEvent;
      if (customEv.detail?.locale) {
        setLocale(customEv.detail.locale);
      }
    };

    window.addEventListener(LANGUAGE_CHANGED_EVENT, handleLocaleChanged);
    return () => window.removeEventListener(LANGUAGE_CHANGED_EVENT, handleLocaleChanged);
  }, []);

  const messages = messagesMap[locale] || enMessages;

  return (
    <I18nContext.Provider value={{ locale, messages }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslations(namespace?: string) {
  const context = useContext(I18nContext);
  const messages = context?.messages || enMessages;

  return (key: string): string => {
    const scope = namespace ? messages[namespace] : messages;
    if (!scope) return key;

    const parts = key.split(".");
    let current: any = scope;
    for (const p of parts) {
      if (current && typeof current === "object" && p in current) {
        current = current[p];
      } else {
        return key;
      }
    }
    return typeof current === "string" ? current : key;
  };
}
