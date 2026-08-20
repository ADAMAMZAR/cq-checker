"use client";

interface RegionSelectCellProps {
  cell: string;
  docId: string | null;
  updatingCell: boolean;
  onRegionChange: (docId: string, region: string) => void;
}

export default function RegionSelectCell({
  cell,
  docId,
  updatingCell,
  onRegionChange,
}: RegionSelectCellProps) {
  const currentRegion = (cell || "GENERAL").toUpperCase();

  return (
    <td className="py-1.5 px-2 align-middle border-b border-[var(--border-subtle)]">
      <select
        value={currentRegion}
        disabled={updatingCell || !docId}
        onChange={(e) => {
          if (docId) onRegionChange(docId, e.target.value);
        }}
        className="px-2.5 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary-border)] text-xs font-semibold text-[var(--heading-color)] outline-none cursor-pointer focus:border-[var(--accent-primary-border)] transition-all disabled:opacity-50"
      >
        <option value="GENERAL">🌐 GENERAL</option>
        <option value="VN">🇻🇳 VN (Vietnam)</option>
        <option value="TW">🇹🇼 TW (Taiwan)</option>
        <option value="MY">🇲🇾 MY (Malaysia)</option>
        <option value="AU">🇦🇺 AU (Australia)</option>
      </select>
    </td>
  );
}
