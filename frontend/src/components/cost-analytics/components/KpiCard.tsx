"use client";

export function KpiCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="double-bezel">
      <div className="double-bezel-inner text-center py-5 px-4">
        <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider block mb-1">
          {title}
        </span>
        <h3 className="text-2xl font-black text-[var(--heading-color)] tracking-tight tabular-nums">
          {value}
        </h3>
        {subtitle && (
          <span className="text-[10px] text-[var(--text-tertiary)] mt-1 block font-medium">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}

export function SkeletonKpiCard() {
  return (
    <div className="double-bezel animate-pulse">
      <div className="double-bezel-inner text-center py-5 px-4 space-y-2">
        <div className="h-3 w-28 bg-[var(--bg-surface-hover)] rounded mx-auto" />
        <div className="h-7 w-32 bg-[var(--bg-surface-hover)] rounded-lg mx-auto" />
        <div className="h-3 w-36 bg-[var(--bg-surface-hover)] rounded mx-auto" />
      </div>
    </div>
  );
}