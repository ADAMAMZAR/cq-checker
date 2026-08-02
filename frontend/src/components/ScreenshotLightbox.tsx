"use client";

import { useEffect, useRef } from "react";

interface ScreenshotLightboxProps {
  src: string | null;
  onClose: () => void;
}

export default function ScreenshotLightbox({ src, onClose }: ScreenshotLightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!src) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Expanded evidence screenshot"
      tabIndex={-1}
      onClick={onClose}
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 cursor-zoom-out animate-fade-in"
    >
      <div className="pop-in relative max-w-5xl max-h-[90vh] overflow-auto rounded-xl border border-[var(--border-visible)] bg-[var(--bg-card-solid)] shadow-2xl">
        <img src={src} alt="Expanded evidence" decoding="async" className="max-w-full h-auto object-contain" />
      </div>
    </div>
  );
}
