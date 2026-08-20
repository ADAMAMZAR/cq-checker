"use client";

import { IconPhoto, IconZoomIn, IconZoomOut } from "@tabler/icons-react";

interface ImageViewerProps {
  fileUrl: string;
  title?: string;
  scale?: number;
}

export default function ImageViewer({ fileUrl, title, scale = 1.0 }: ImageViewerProps) {
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-4 bg-[var(--bg-page)] overflow-auto">
      <div className="flex flex-col items-center gap-3 max-w-full">
        <div className="p-2 rounded-2xl bg-[var(--bg-card-solid)] border border-[var(--border-visible)] shadow-lg overflow-hidden flex items-center justify-center max-w-full">
          <img
            src={fileUrl}
            alt={title || "Citation Image Source"}
            className="max-w-full h-auto object-contain transition-transform duration-200"
            style={{ transform: `scale(${scale})` }}
          />
        </div>
        <p className="text-xs font-semibold text-[var(--text-tertiary)] flex items-center gap-1.5">
          <IconPhoto className="w-4 h-4 text-[var(--accent-primary-text)]" />
          <span>{title || "Image Source"}</span>
        </p>
      </div>
    </div>
  );
}
