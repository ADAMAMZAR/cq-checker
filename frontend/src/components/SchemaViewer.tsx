"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  IconSchema,
  IconTable,
  IconKey,
  IconLink,
  IconLoader2,
  IconRefresh,
  IconSearch,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconCircleCheck,
  IconGripVertical,
  IconLayoutOff,
} from "@tabler/icons-react";
import type {
  DbSchema,
  DbTableSchema,
  DbRelationship,
  DbColumnMeta,
} from "@/types";
import { fetchDbSchema } from "@/lib/api";

type Layout = {
  table: DbTableSchema;
  x: number;
  y: number;
  width: number;
  height: number;
};

type Pos = { x: number; y: number };

const CARD_WIDTH = 280;
const ROW_HEIGHT = 24;
const HEADER_HEIGHT = 56;
const TABLE_PADDING = 12;
const COLUMN_GAP = 80;
const ROW_GAP = 60;
const DRAG_THRESHOLD = 3; // px before a press is treated as a drag

/**
 * SchemaViewer — interactive ERD-style database schema explorer.
 *
 * Renders every public table as a card with its columns, primary keys,
 * foreign keys, and non-PK indexes. Foreign-key relationships are drawn
 * as SVG curves connecting the FK column to the referenced PK column.
 *
 * Interactions:
 *   - Drag a card by its header to reposition it. Edges follow.
 *   - Click a card to focus on its direct FK relationships; unrelated
 *     tables dim.
 *   - Click the empty canvas to deselect.
 *   - "Reset layout" restores the auto-laid-out positions.
 */
export default function SchemaViewer() {
  const [schema, setSchema] = useState<DbSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [focused, setFocused] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [draggedPositions, setDraggedPositions] = useState<Record<string, Pos>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDbSchema();
      setSchema(data);
      // Reset dragged positions when the schema reloads (Refresh button).
      setDraggedPositions({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schema.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-computed layout from the schema. Dragged positions override per-card.
  const autoLayout = useMemo(() => {
    if (!schema) return { positions: new Map<string, Layout>(), bounds: { w: 0, h: 0 } };
    return computeLayout(schema);
  }, [schema]);

  // Effective positions: dragged override the auto-layout.
  const effectivePositions = useMemo(() => {
    const map = new Map<string, Layout>();
    for (const [name, pos] of autoLayout.positions.entries()) {
      const drag = draggedPositions[name];
      map.set(name, drag ? { ...pos, x: drag.x, y: drag.y } : pos);
    }
    return map;
  }, [autoLayout, draggedPositions]);

  // Bounds expand to include any dragged card that strays outside the original grid.
  const effectiveBounds = useMemo(() => {
    let maxX = autoLayout.bounds.w;
    let maxY = autoLayout.bounds.h;
    for (const pos of effectivePositions.values()) {
      maxX = Math.max(maxX, pos.x + pos.width + 32);
      maxY = Math.max(maxY, pos.y + pos.height + 32);
    }
    return { w: maxX, h: maxY };
  }, [autoLayout.bounds, effectivePositions]);

  const filteredTables = useMemo(() => {
    if (!schema) return [];
    const f = filter.trim().toLowerCase();
    if (!f) return schema.tables;
    return schema.tables.filter(
      (t) =>
        t.name.toLowerCase().includes(f) ||
        t.columns.some((c) => c.name.toLowerCase().includes(f))
    );
  }, [schema, filter]);

  const visibleRelCount = useMemo(() => {
    if (!schema) return 0;
    if (!focused) return schema.relationships.length;
    return schema.relationships.filter(
      (r) => r.from_table === focused || r.to_table === focused
    ).length;
  }, [schema, focused]);

  const isDimmed = useCallback(
    (tableName: string): boolean => {
      if (!focused) return false;
      if (tableName === focused) return false;
      if (!schema) return false;
      return !schema.relationships.some(
        (r) =>
          (r.from_table === focused && r.to_table === tableName) ||
          (r.to_table === focused && r.from_table === tableName)
      );
    },
    [focused, schema]
  );

  const resetLayout = useCallback(() => {
    setDraggedPositions({});
  }, []);

  // ── Drag handling ────────────────────────────────────────────────────
  const dragStateRef = useRef<{
    tableName: string;
    startClientX: number;
    startClientY: number;
    startCardX: number;
    startCardY: number;
    moved: boolean;
  } | null>(null);

  const handleCardPointerDown = useCallback(
    (tableName: string) => (e: React.PointerEvent<HTMLDivElement>) => {
      // Only the primary button. Ignore middle/right clicks.
      if (e.button !== 0) return;
      const pos = effectivePositions.get(tableName);
      if (!pos) return;
      // Capture the pointer so move/up events keep firing even if the
      // cursor leaves the card during a fast drag.
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      dragStateRef.current = {
        tableName,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startCardX: pos.x,
        startCardY: pos.y,
        moved: false,
      };
    },
    [effectivePositions]
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const s = dragStateRef.current;
      if (!s) return;
      const dx = e.clientX - s.startClientX;
      const dy = e.clientY - s.startClientY;
      if (!s.moved) {
        if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) s.moved = true;
        else return;
      }
      setDraggedPositions((prev) => ({
        ...prev,
        [s.tableName]: { x: s.startCardX + dx, y: s.startCardY + dy },
      }));
    };
    const onUp = () => {
      dragStateRef.current = null;
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // Suppress the focus click when a drag just ended.
  const suppressClickRef = useRef(false);
  useEffect(() => {
    const onUp = () => {
      if (dragStateRef.current?.moved) {
        suppressClickRef.current = true;
        // Reset on the next tick so the very next genuine click still fires.
        setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }
    };
    document.addEventListener("pointerup", onUp);
    return () => document.removeEventListener("pointerup", onUp);
  }, []);

  const handleCardClick = useCallback(
    (tableName: string) => (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (suppressClickRef.current) return;
      setFocused((prev) => (prev === tableName ? null : tableName));
    },
    []
  );

  return (
    <div
      className={`flex-1 flex flex-col gap-4 animate-fade-in ${isFullscreen ? "fixed inset-0 z-50 bg-[var(--bg-page)] p-4" : ""
        }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)]">
            <IconSchema className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-sans text-lg font-bold text-[var(--heading-color)]">
              Schema Viewer
            </h1>
            <p className="font-serif text-xs text-[var(--text-secondary)]">
              Every table, every column, every relationship. Drag a card to rearrange;
              click to focus; click empty space to deselect.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-tertiary)]" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter tables or columns…"
              className="pl-8 pr-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-visible)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary-border)] w-64"
            />
          </div>
          {Object.keys(draggedPositions).length > 0 && (
            <button
              onClick={resetLayout}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border-visible)] text-[var(--text-secondary)] hover:text-[var(--heading-color)] text-xs font-semibold cursor-pointer"
              title="Restore the auto-laid-out positions"
            >
              <IconLayoutOff className="w-3.5 h-3.5" />
              Reset layout
            </button>
          )}
          {focused && (
            <button
              onClick={() => setFocused(null)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)] text-xs font-semibold cursor-pointer"
              title="Clear table focus (or click the empty canvas)"
            >
              <IconCircleCheck className="w-3.5 h-3.5" />
              Showing all
            </button>
          )}
          <button
            onClick={load}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-xs font-semibold transition-all cursor-pointer"
          >
            <IconRefresh className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => setIsFullscreen((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-visible)] text-[var(--text-secondary)] hover:text-[var(--heading-color)] text-xs cursor-pointer"
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? <IconArrowsMinimize className="w-4 h-4" /> : <IconArrowsMaximize className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
          {error}
        </div>
      )}

      {/* Stats bar */}
      {schema && (
        <div className="flex items-center gap-4 text-[10px] uppercase tracking-wider font-mono text-[var(--text-tertiary)]">
          <span>{schema.tables.length} tables</span>
          <span>·</span>
          <span>
            {schema.tables.reduce((acc, t) => acc + t.columns.length, 0)} columns
          </span>
          <span>·</span>
          <span>
            {visibleRelCount}
            {focused ? " of " : ""}
            {focused ? schema.relationships.length : ""} relationships
          </span>
          {focused && (
            <span>
              · focused on <b className="text-[var(--accent-primary-text)]">{focused}</b>
            </span>
          )}
        </div>
      )}

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 min-h-[640px] rounded-xl border border-[var(--border-visible)] bg-[var(--bg-card)] overflow-auto relative"
        onClick={(e) => {
          // Click on empty canvas (not on a card) deselects.
          if (e.target === e.currentTarget) setFocused(null);
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-[var(--text-tertiary)] text-xs">
            <IconLoader2 className="w-4 h-4 animate-spin" />
            Loading schema…
          </div>
        ) : !schema ? (
          <div className="flex items-center justify-center py-20 text-xs text-[var(--text-tertiary)]">
            No schema data.
          </div>
        ) : (
          <SchemaCanvas
            schema={schema}
            positions={effectivePositions}
            bounds={effectiveBounds}
            filteredTables={filteredTables}
            focused={focused}
            isDimmed={isDimmed}
            onCardPointerDown={handleCardPointerDown}
            onCardClick={handleCardClick}
          />
        )}
      </div>
    </div>
  );
}

// ── Layout: rank tables by FK popularity, then grid-pack ────────────────

function computeLayout(schema: DbSchema): {
  positions: Map<string, Layout>;
  bounds: { w: number; h: number };
} {
  const tables = schema.tables;
  const sorted = [...tables].sort((a, b) => {
    const aa = schema.relationships.filter((r) => r.to_table === a.name).length;
    const bb = schema.relationships.filter((r) => r.to_table === b.name).length;
    if (bb !== aa) return bb - aa;
    return a.name.localeCompare(b.name);
  });

  const positions = new Map<string, Layout>();
  const numCols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(sorted.length * 1.4))));
  let col = 0;
  let row = 0;
  let rowMaxHeight = 0;
  let totalWidth = 0;

  for (const t of sorted) {
    const height = HEADER_HEIGHT + t.columns.length * ROW_HEIGHT + TABLE_PADDING * 2;
    if (col >= numCols) {
      col = 0;
      row += 1;
      rowMaxHeight = 0;
    }
    const x = 32 + col * (CARD_WIDTH + COLUMN_GAP);
    const y = 32 + row * (height + ROW_GAP);
    positions.set(t.name, { table: t, x, y, width: CARD_WIDTH, height });
    rowMaxHeight = Math.max(rowMaxHeight, height);
    totalWidth = Math.max(totalWidth, x + CARD_WIDTH);
    col += 1;
  }
  const totalHeight = 32 + (row + 1) * (rowMaxHeight + ROW_GAP) + 32;

  return { positions, bounds: { w: totalWidth + 32, h: totalHeight } };
}

// ── Canvas: renders cards + SVG relationship lines ────────────────────────

function SchemaCanvas({
  schema,
  positions,
  bounds,
  filteredTables,
  focused,
  isDimmed,
  onCardPointerDown,
  onCardClick,
}: {
  schema: DbSchema;
  positions: Map<string, Layout>;
  bounds: { w: number; h: number };
  filteredTables: DbTableSchema[];
  focused: string | null;
  isDimmed: (n: string) => boolean;
  onCardPointerDown: (n: string) => (e: React.PointerEvent<HTMLDivElement>) => void;
  onCardClick: (n: string) => (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const visibleRels = focused
    ? schema.relationships.filter(
      (r) => r.from_table === focused || r.to_table === focused
    )
    : schema.relationships;

  const edges = visibleRels
    .map((r) => buildEdge(r, positions))
    .filter((e): e is Edge => e !== null);

  return (
    <div className="relative" style={{ width: bounds.w, height: bounds.h }}>
      <svg
        className="absolute inset-0 pointer-events-none"
        width={bounds.w}
        height={bounds.h}
      >
        <defs>
          <marker
            id="fk-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent-primary)" />
          </marker>
          <marker
            id="fk-arrow-dim"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-tertiary)" />
          </marker>
        </defs>
        {edges.map((e, i) => {
          const dim = isDimmed(e.fromTable) || isDimmed(e.toTable);
          return (
            <path
              key={i}
              d={e.d}
              fill="none"
              stroke={dim ? "var(--text-tertiary)" : "var(--accent-primary)"}
              strokeOpacity={dim ? 0.25 : 0.7}
              strokeWidth={dim ? 1 : 1.5}
              strokeDasharray={dim ? "4 4" : undefined}
              markerEnd={`url(#${dim ? "fk-arrow-dim" : "fk-arrow"})`}
            />
          );
        })}
      </svg>

      {filteredTables.map((t) => {
        const pos = positions.get(t.name);
        if (!pos) return null;
        const dim = isDimmed(t.name);
        return (
          <TableCard
            key={t.name}
            layout={pos}
            dim={dim}
            focused={focused === t.name}
            isReferenced={visibleRels.some(
              (r) => r.to_table === t.name && r.from_table !== t.name
            )}
            onPointerDown={onCardPointerDown(t.name)}
            onClick={onCardClick(t.name)}
          />
        );
      })}
    </div>
  );
}

type Edge = { d: string; fromTable: string; toTable: string };

function buildEdge(
  r: DbRelationship,
  positions: Map<string, Layout>
): Edge | null {
  const from = positions.get(r.from_table);
  const to = positions.get(r.to_table);
  if (!from || !to) return null;
  const fromIdx = from.table.columns.findIndex((c) => c.name === r.from_column);
  const toIdx = to.table.columns.findIndex((c) => c.name === r.to_column);
  if (fromIdx < 0 || toIdx < 0) return null;

  const fromX = from.x + from.width;
  const fromY = from.y + HEADER_HEIGHT + TABLE_PADDING + fromIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
  const toX = to.x;
  const toY = to.y + HEADER_HEIGHT + TABLE_PADDING + toIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

  const dx = toX - fromX;
  const c1x = fromX + Math.max(60, Math.abs(dx) * 0.5);
  const c2x = toX - Math.max(60, Math.abs(dx) * 0.5);
  const d = `M ${fromX} ${fromY} C ${c1x} ${fromY}, ${c2x} ${toY}, ${toX} ${toY}`;
  return { d, fromTable: r.from_table, toTable: r.to_table };
}

// ── Card ─────────────────────────────────────────────────────────────────

function TableCard({
  layout,
  dim,
  focused,
  isReferenced,
  onPointerDown,
  onClick,
}: {
  layout: Layout;
  dim: boolean;
  focused: boolean;
  isReferenced: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const { table, x, y, width, height } = layout;
  return (
    <div
      onPointerDown={onPointerDown}
      onClick={onClick}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        minHeight: height,
        opacity: dim ? 0.35 : 1,
        transition: dim ? "opacity 200ms" : "opacity 200ms, box-shadow 200ms, transform 200ms",
        zIndex: focused ? 20 : isReferenced ? 10 : 5,
        transform: focused ? "scale(1.02)" : "scale(1)",
        touchAction: "none", // prevent the browser from hijacking drag for scrolling
      }}
      className={`rounded-xl border select-none ${focused
          ? "border-[var(--accent-primary)] shadow-[0_0_0_2px_var(--accent-primary-soft)]"
          : "border-[var(--border-visible)] hover:border-[var(--accent-primary-border)]"
        } bg-[var(--bg-card)] overflow-hidden`}
    >
      {/* Header — the drag handle */}
      <div
        className={`flex items-center justify-between gap-2 px-3 py-2 border-b cursor-grab active:cursor-grabbing ${focused
            ? "bg-[var(--accent-primary-soft)] border-[var(--accent-primary-border)]"
            : "bg-[var(--bg-elevated)] border-[var(--border-subtle)]"
          }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <IconGripVertical className="w-3.5 h-3.5 shrink-0 text-[var(--text-tertiary)]" />
          <IconTable className="w-4 h-4 shrink-0 text-[var(--accent-primary-text)]" />
          <span className="font-mono text-sm font-bold text-[var(--heading-color)] truncate">
            {table.name}
          </span>
        </div>
        <span className="font-mono text-[10px] text-[var(--text-tertiary)] shrink-0">
          {table.row_count ?? "–"} rows
        </span>
      </div>

      {/* Columns */}
      <div className="px-3 py-2 space-y-0">
        {table.columns.map((c) => (
          <ColumnRow key={c.name} col={c} isReferenced={isReferenced} />
        ))}
      </div>

      {/* Indexes footer (compact) */}
      {table.indexes.length > 0 && (
        <div className="px-3 py-1.5 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
          <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">
            Indexes
          </div>
          <div className="flex flex-wrap gap-1">
            {table.indexes.slice(0, 4).map((idx) => (
              <span
                key={idx}
                className="font-mono text-[9px] text-[var(--text-tertiary)] bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5"
                title={idx}
              >
                {idx}
              </span>
            ))}
            {table.indexes.length > 4 && (
              <span className="font-mono text-[9px] text-[var(--text-tertiary)]">
                +{table.indexes.length - 4} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ColumnRow({ col, isReferenced }: { col: DbColumnMeta; isReferenced: boolean }) {
  return (
    <div className="flex items-center gap-1.5 h-[24px] text-[11px] font-mono">
      <span className="w-3 shrink-0 flex items-center justify-center">
        {col.is_primary_key ? (
          <IconKey className="w-3 h-3 text-amber-400" title="Primary key" />
        ) : col.is_foreign_key ? (
          <IconLink
            className={`w-3 h-3 ${isReferenced ? "text-emerald-400" : "text-sky-400"}`}
            title={`Foreign key -> ${col.references?.table}.${col.references?.column}`}
          />
        ) : (
          <span className="w-3" />
        )}
      </span>
      <span className="text-[var(--text-primary)] truncate flex-1" title={col.name}>
        {col.name}
      </span>
      <span className="text-[var(--text-tertiary)] text-[10px] shrink-0">{col.type_display}</span>
      {!col.nullable && (
        <span
          className="text-red-400 text-[9px] font-bold shrink-0"
          title="NOT NULL"
        >
          NN
        </span>
      )}
    </div>
  );
}
