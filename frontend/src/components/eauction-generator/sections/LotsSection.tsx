"use client";

import {
  IconChevronDown,
  IconChevronRight,
  IconPlus,
  IconTrash,
  IconArrowRight,
} from "@tabler/icons-react";
import type { EventType, LotItem, LineItem } from "../types";

interface LotsSectionProps {
  isOpen: boolean;
  onToggle: () => void;
  onNext: () => void;
  eventType: EventType;
  lots: LotItem[];
  setLots: React.Dispatch<React.SetStateAction<LotItem[]>>;
}

export default function LotsSection({
  isOpen,
  onToggle,
  onNext,
  eventType,
  lots,
  setLots,
}: LotsSectionProps) {
  const isSpecial = eventType === "Japanese" || eventType === "Dutch";
  const priceStepLabel = eventType === "Japanese" ? "Bid Decrement Amount" : "Bid Increment Amount";

  const addLotCard = () => {
    const newLotId = `lot-${Date.now()}`;
    setLots((prev) => [
      ...prev,
      {
        id: newLotId,
        title: "",
        startPrice: "",
        stepPrice: "",
        lines: [],
      },
    ]);
  };

  const removeLotCard = (lotId: string) => {
    setLots((prev) => prev.filter((lot) => lot.id !== lotId));
  };

  const updateLot = (lotId: string, field: keyof LotItem, value: any) => {
    setLots((prev) =>
      prev.map((lot) => (lot.id === lotId ? { ...lot, [field]: value } : lot))
    );
  };

  const addLineItem = (lotId: string) => {
    const newLine: LineItem = {
      id: `line-${Date.now()}-${Math.floor(Math.random() * 100)}`,
      description: "",
      startPrice: "",
      stepPrice: "",
    };
    setLots((prev) =>
      prev.map((lot) =>
        lot.id === lotId ? { ...lot, lines: [...lot.lines, newLine] } : lot
      )
    );
  };

  const removeLineItem = (lotId: string, lineId: string) => {
    setLots((prev) =>
      prev.map((lot) =>
        lot.id === lotId
          ? { ...lot, lines: lot.lines.filter((line) => line.id !== lineId) }
          : lot
      )
    );
  };

  const updateLineItem = (
    lotId: string,
    lineId: string,
    field: keyof LineItem,
    value: string
  ) => {
    setLots((prev) =>
      prev.map((lot) =>
        lot.id === lotId
          ? {
              ...lot,
              lines: lot.lines.map((line) =>
                line.id === lineId ? { ...line, [field]: value } : line
              ),
            }
          : lot
      )
    );
  };

  return (
    <div className="rounded-xl border border-[var(--border-visible)] bg-[var(--bg-card)] shadow-md overflow-hidden transition-all duration-300">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className="h-6 w-6 rounded-full bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] font-bold text-xs flex items-center justify-center border border-[var(--accent-primary-border)]">
            2
          </span>
          <h2 className="text-base font-bold text-[var(--heading-color)] tracking-wide uppercase">
            Lot(s) & Line Items ({lots.length})
          </h2>
        </div>
        <div className="text-[var(--text-tertiary)] flex items-center gap-2 text-xs font-semibold">
          <span>{isOpen ? "Collapse" : "Expand"}</span>
          {isOpen ? <IconChevronDown className="w-4 h-4" /> : <IconChevronRight className="w-4 h-4" />}
        </div>
      </button>

      {isOpen && (
        <div className="p-6 space-y-6 animate-fade-in">
          <p className="text-xs text-[var(--text-tertiary)]">
            Create your structure dynamically. If a Lot has no sub-line items, it will render automatically as a standalone lot configuration block.
          </p>

          {/* Dynamic Lots Cards Array */}
          <div className="space-y-4">
            {lots.map((lot, lotIdx) => {
              const showLotPricingBlock = isSpecial && lot.lines.length === 0;

              return (
                <div
                  key={lot.id}
                  className="p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-4 shadow-sm"
                >
                  <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--heading-color)] flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] font-mono">
                        Lot #{lotIdx + 1}
                      </span>
                      <span>Reference Descriptor</span>
                    </h3>

                    {lots.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLotCard(lot.id)}
                        className="px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
                      >
                        <IconTrash className="w-3.5 h-3.5" />
                        <span>Remove Lot</span>
                      </button>
                    )}
                  </div>

                  {/* Lot Title */}
                  <div>
                    <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1">
                      Lot Name / Title Descriptor <span className="text-[var(--mismatch-text)]">*</span>
                    </label>
                    <input
                      type="text"
                      value={lot.title}
                      onChange={(e) => updateLot(lot.id, "title", e.target.value)}
                      placeholder="e.g. Supply and Delivery of Control Cables"
                      required
                      className="w-full px-4 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--match-border)] transition-all font-sans"
                    />
                  </div>

                  {/* Standalone Lot Pricing Block for Japanese/Dutch when NO sub-lines */}
                  {showLotPricingBlock && (
                    <div className="p-3.5 rounded-xl bg-[var(--accent-warning-soft)] border border-[var(--accent-warning-border)] grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
                      <div>
                        <label className="text-[10px] font-bold text-[var(--accent-warning-text)] uppercase tracking-wider block mb-1">
                          Lot Starting Price *
                        </label>
                        <input
                          type="text"
                          value={lot.startPrice}
                          onChange={(e) => updateLot(lot.id, "startPrice", e.target.value)}
                          placeholder="e.g. 50,000.00"
                          required
                          className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-[var(--accent-warning-text)] uppercase tracking-wider block mb-1">
                          Lot {priceStepLabel} *
                        </label>
                        <input
                          type="text"
                          value={lot.stepPrice}
                          onChange={(e) => updateLot(lot.id, "stepPrice", e.target.value)}
                          placeholder="e.g. 1,500.00"
                          required
                          className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-mono"
                        />
                      </div>
                    </div>
                  )}

                  {/* Sub-Line Items Rows */}
                  <div className="space-y-3 pt-2">
                    {lot.lines.map((line, lineIdx) => (
                      <div
                        key={line.id}
                        className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] space-y-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-bold text-[var(--text-tertiary)] shrink-0">
                            Line 3.{lotIdx + 1}.{lineIdx + 1}
                          </span>
                          <input
                            type="text"
                            value={line.description}
                            onChange={(e) =>
                              updateLineItem(lot.id, line.id, "description", e.target.value)
                            }
                            placeholder="e.g. Testing and Commissioning of Control Systems"
                            required
                            className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                          />
                          <button
                            type="button"
                            onClick={() => removeLineItem(lot.id, line.id)}
                            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all shrink-0 active:scale-95 cursor-pointer"
                          >
                            <IconTrash className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Sub-Line Special Pricing Block */}
                        {isSpecial && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-[var(--border-subtle)] animate-fade-in">
                            <div>
                              <label className="text-[9px] font-bold text-[var(--text-tertiary)] uppercase block mb-1">
                                Line Starting Price *
                              </label>
                              <input
                                type="text"
                                value={line.startPrice}
                                onChange={(e) =>
                                  updateLineItem(lot.id, line.id, "startPrice", e.target.value)
                                }
                                placeholder="e.g. 12,000.00"
                                required
                                className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-[var(--text-tertiary)] uppercase block mb-1">
                                Line {priceStepLabel} *
                              </label>
                              <input
                                type="text"
                                value={line.stepPrice}
                                onChange={(e) =>
                                  updateLineItem(lot.id, line.id, "stepPrice", e.target.value)
                                }
                                placeholder="e.g. 500.00"
                                required
                                className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)]"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => addLineItem(lot.id)}
                      className="text-xs font-semibold text-[var(--match-text)] hover:underline inline-flex items-center gap-1 cursor-pointer pt-1"
                    >
                      <IconPlus className="w-3.5 h-3.5" />
                      <span>Add Sub-Line Item to Lot #{lotIdx + 1}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add New Lot Button */}
          <div>
            <button
              type="button"
              onClick={addLotCard}
              className="px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-visible)] text-xs font-bold text-[var(--heading-color)] transition-all active:scale-95 flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <IconPlus className="w-4 h-4 text-[var(--match-text)]" />
              <span>Add New Lot Section</span>
            </button>
          </div>

          {/* Next Section Step Button */}
          <div className="flex justify-end pt-4 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onNext}
              className="px-5 py-2 rounded-xl bg-[var(--accent-primary-soft)] hover:bg-[var(--accent-primary-soft-strong)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)] font-bold text-xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <span>Next: Contact Information</span>
              <IconArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
