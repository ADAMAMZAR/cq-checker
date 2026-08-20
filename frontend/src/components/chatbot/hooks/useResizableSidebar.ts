"use client";

import { useState, useCallback, useRef } from "react";

export function useResizableSidebar(initialWidth = 28, minPct = 25, maxPct = 60) {
  const [leftWidth, setLeftWidth] = useState<number>(initialWidth);
  const isDraggingRef = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const container = document.getElementById("chatbot-container");
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const relativeX = moveEvent.clientX - rect.left;
        const newPct = (relativeX / rect.width) * 100;
        const clamped = Math.min(maxPct, Math.max(minPct, newPct));
        setLeftWidth(clamped);
      };

      const onMouseUp = () => {
        isDraggingRef.current = false;
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [minPct, maxPct]
  );

  return { leftWidth, handleMouseDown };
}
