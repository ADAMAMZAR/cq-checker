"use client";

interface ScreenshotLightboxProps {
  src: string | null;
  onClose: () => void;
}

export default function ScreenshotLightbox({ src, onClose }: ScreenshotLightboxProps) {
  if (!src) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 cursor-zoom-out animate-fade-in"
    >
      <div className="relative max-w-5xl max-h-[90vh] overflow-auto rounded-xl border border-[var(--border-visible)] bg-[var(--bg-card-solid)] shadow-2xl">
        <img src={src} alt="Expanded evidence" className="max-w-full h-auto object-contain" />
      </div>
    </div>
  );
}
