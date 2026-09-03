"use client";

import { IconChevronDown, IconChevronRight, IconArrowRight } from "@tabler/icons-react";
import type { EventType } from "../types";
import { formatMalaysiaDate } from "@/lib/dateUtils";

interface EventInfoSectionProps {
  isOpen: boolean;
  onToggle: () => void;
  onNext: () => void;
  eventType: EventType;
  setEventType: (v: EventType) => void;
  eventName: string;
  setEventName: (v: string) => void;
  intervalTime: string;
  setIntervalTime: (v: string) => void;
  biddingDate: string;
  setBiddingDate: (v: string) => void;
  startTimeHour: string;
  setStartTimeHour: (v: string) => void;
  startTimeMin: string;
  setStartTimeMin: (v: string) => void;
  startTimeAmpm: string;
  setStartTimeAmpm: (v: string) => void;
  closeTimeHour: string;
  setCloseTimeHour: (v: string) => void;
  closeTimeMin: string;
  setCloseTimeMin: (v: string) => void;
  closeTimeAmpm: string;
  setCloseTimeAmpm: (v: string) => void;
  bidCurrency: string;
  setBidCurrency: (v: string) => void;
  minimumBidDecrement: string;
  setMinimumBidDecrement: (v: string) => void;
  bidBufferAmount: string;
  setBidBufferAmount: (v: string) => void;
  biddingBasis: string;
  setBiddingBasis: (v: string) => void;
  ceilingPriceRef: string;
  setCeilingPriceRef: (v: string) => void;
  ceilingPriceDate: string;
  setCeilingPriceDate: (v: string) => void;
}

export default function EventInfoSection({
  isOpen,
  onToggle,
  onNext,
  eventType,
  setEventType,
  eventName,
  setEventName,
  intervalTime,
  setIntervalTime,
  biddingDate,
  setBiddingDate,
  startTimeHour,
  setStartTimeHour,
  startTimeMin,
  setStartTimeMin,
  startTimeAmpm,
  setStartTimeAmpm,
  closeTimeHour,
  setCloseTimeHour,
  closeTimeMin,
  setCloseTimeMin,
  closeTimeAmpm,
  setCloseTimeAmpm,
  bidCurrency,
  setBidCurrency,
  minimumBidDecrement,
  setMinimumBidDecrement,
  bidBufferAmount,
  setBidBufferAmount,
  biddingBasis,
  setBiddingBasis,
  ceilingPriceRef,
  setCeilingPriceRef,
  ceilingPriceDate,
  setCeilingPriceDate,
}: EventInfoSectionProps) {
  const isSpecial = eventType === "Japanese" || eventType === "Dutch";
  const requiresTimingInput = isSpecial || eventType === "Seal Bid";
  const isTrafficLightEmail = eventType === "Traffic Light (Ceiling Price send via Email)";
  const isForwardAuction = eventType === "Forward Auction";

  const decrementIncrementLabel = isForwardAuction
    ? "Minimum Bid Increment *"
    : "Minimum Bid Decrement *";

  const decrementIncrementPlaceholder = isForwardAuction ? "e.g. 500" : "e.g. 3";

  return (
    <div className="rounded-xl border border-[var(--border-visible)] bg-[var(--bg-card)] shadow-md overflow-hidden transition-all duration-300">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className="h-6 w-6 rounded-full bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] font-bold text-xs flex items-center justify-center border border-[var(--accent-primary-border)]">
            1
          </span>
          <h2 className="text-base font-bold text-[var(--heading-color)] tracking-wide uppercase">
            Auction Event Information
          </h2>
        </div>
        <div className="text-[var(--text-tertiary)] flex items-center gap-2 text-xs font-semibold">
          <span>{isOpen ? "Collapse" : "Expand"}</span>
          {isOpen ? <IconChevronDown className="w-4 h-4" /> : <IconChevronRight className="w-4 h-4" />}
        </div>
      </button>

      {isOpen && (
        <div className="p-6 space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Event Type */}
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                Event Type <span className="text-[var(--mismatch-text)]">*</span>
              </label>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value as EventType)}
                required
                className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--match-border)] transition-all font-sans"
              >
                <option value="" disabled>
                  Select Event Type
                </option>
                <option value="Japanese">Japanese</option>
                <option value="Traffic Light">Traffic Light</option>
                <option value="Traffic Light - Show Green When Best Bid">
                  Traffic Light - Show Green When Best Bid
                </option>
                <option value="Dutch">Dutch</option>
                <option value="Seal Bid">Seal Bid</option>
                <option value="Reversed Auction - Show Own Rank">Reversed Auction - Show Own Rank</option>
                <option value="Reversed Auction - Leading">Reversed Auction - Leading</option>
                <option value="Forward Auction">Forward Auction</option>
                <option value="Traffic Light (Ceiling Price send via Email)">
                  Traffic Light (Ceiling Price send via Email)
                </option>
              </select>
            </div>

            {/* Event Name */}
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                Event Name <span className="text-[var(--mismatch-text)]">*</span>
              </label>
              <input
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="e.g. GME_AUCTION_RWSS_CABLES_18032026"
                required
                className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--match-border)] transition-all font-sans"
              />
            </div>
          </div>

          {/* Dynamic Timing Interval Section */}
          {requiresTimingInput && (
            <div className="p-4 rounded-xl bg-[var(--accent-warning-soft)] border border-[var(--accent-warning-border)] space-y-2 animate-fade-in">
              <label className="text-xs font-bold text-[var(--accent-warning-text)] uppercase tracking-wider block">
                {eventType === "Seal Bid"
                  ? "Auction Format Duration (Minutes) *"
                  : `${eventType} Auction Auto-Interval Time (Minutes) *`}
              </label>
              <input
                type="number"
                value={intervalTime}
                onChange={(e) => setIntervalTime(e.target.value)}
                placeholder="e.g. 2 or 5"
                min="1"
                required
                className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--match-border)] transition-all font-mono"
              />
              <p className="text-[11px] text-[var(--text-tertiary)]">
                Specify how long each automated round remains open before processing pricing step movements.
              </p>
            </div>
          )}

          {/* Timing Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Bidding Date */}
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                Bidding Date <span className="text-[var(--mismatch-text)]">*</span>
                {biddingDate && (
                  <span className="text-[10px] text-emerald-500 font-mono font-medium ml-2">
                    ({formatMalaysiaDate(biddingDate)})
                  </span>
                )}
              </label>
              <input
                type="date"
                value={biddingDate}
                onChange={(e) => setBiddingDate(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--match-border)] transition-all font-sans"
              />
            </div>

            {/* Start Time */}
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                Start Time <span className="text-[var(--mismatch-text)]">*</span>
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={startTimeHour}
                  onChange={(e) => setStartTimeHour(e.target.value)}
                  placeholder="HH"
                  min="1"
                  max="12"
                  required
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-center font-mono text-[var(--text-primary)]"
                />
                <span className="text-sm font-bold text-[var(--text-tertiary)]">:</span>
                <input
                  type="number"
                  value={startTimeMin}
                  onChange={(e) => setStartTimeMin(e.target.value)}
                  placeholder="MM"
                  min="0"
                  max="59"
                  required
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-center font-mono text-[var(--text-primary)]"
                />
                <select
                  value={startTimeAmpm}
                  onChange={(e) => setStartTimeAmpm(e.target.value)}
                  className="px-2.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-primary)] shrink-0"
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>

            {/* Close Time */}
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                Close Time <span className="text-[var(--mismatch-text)]">*</span>
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={closeTimeHour}
                  onChange={(e) => setCloseTimeHour(e.target.value)}
                  placeholder="HH"
                  min="1"
                  max="12"
                  required
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-center font-mono text-[var(--text-primary)]"
                />
                <span className="text-sm font-bold text-[var(--text-tertiary)]">:</span>
                <input
                  type="number"
                  value={closeTimeMin}
                  onChange={(e) => setCloseTimeMin(e.target.value)}
                  placeholder="MM"
                  min="0"
                  max="59"
                  required
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-center font-mono text-[var(--text-primary)]"
                />
                <select
                  value={closeTimeAmpm}
                  onChange={(e) => setCloseTimeAmpm(e.target.value)}
                  className="px-2.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-primary)] shrink-0"
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
          </div>

          {/* Currency & Decrement */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Bid Currency */}
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                Bid Currency <span className="text-[var(--mismatch-text)]">*</span>
              </label>
              <input
                type="text"
                value={bidCurrency}
                onChange={(e) => setBidCurrency(e.target.value)}
                placeholder="e.g. RM or USD"
                required
                className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--match-border)] transition-all font-sans"
              />
            </div>

            {/* Min Bid Decrement / Increment */}
            {!isSpecial && (
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                  {decrementIncrementLabel}
                </label>
                <input
                  type="text"
                  value={minimumBidDecrement}
                  onChange={(e) => setMinimumBidDecrement(e.target.value)}
                  placeholder={decrementIncrementPlaceholder}
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--match-border)] transition-all font-sans"
                />
              </div>
            )}

            {/* Bid Buffer Amount */}
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                Bid Buffer Amount <span className="text-[var(--text-tertiary)] font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={bidBufferAmount}
                onChange={(e) => setBidBufferAmount(e.target.value)}
                placeholder="e.g. 2"
                className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--match-border)] transition-all font-sans"
              />
            </div>
          </div>

          {/* Basis & Ceiling Price Container */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* Bidding Basis */}
            <div className={isTrafficLightEmail ? "md:col-span-4" : "md:col-span-6"}>
              <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                Bidding Basis <span className="text-[var(--mismatch-text)]">*</span>
              </label>
              <select
                value={biddingBasis}
                onChange={(e) => setBiddingBasis(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--match-border)] transition-all font-sans"
              >
                <option value="per lot">per lot</option>
                <option value="per unit">per unit</option>
              </select>
            </div>

            {/* Ceiling Price Reference */}
            <div className={isTrafficLightEmail ? "md:col-span-4" : "md:col-span-6"}>
              <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                {isTrafficLightEmail
                  ? "Ceiling Price Issuer Email *"
                  : "Ceiling Price Document Reference *"}
              </label>
              <input
                type={isTrafficLightEmail ? "email" : "text"}
                value={ceilingPriceRef}
                onChange={(e) => setCeilingPriceRef(e.target.value)}
                placeholder={
                  isTrafficLightEmail ? "e.g. issuer@gamuda.com.my" : "e.g. GAMUDA/REF/2026"
                }
                required
                className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--match-border)] transition-all font-sans"
              />
            </div>

            {/* Optional Ceiling Email Reference Date */}
            {isTrafficLightEmail && (
              <div className="md:col-span-4 animate-fade-in">
                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                  Email Reference Date <span className="text-[var(--mismatch-text)]">*</span>
                  {ceilingPriceDate && (
                    <span className="text-[10px] text-emerald-500 font-mono font-medium ml-2">
                      ({formatMalaysiaDate(ceilingPriceDate)})
                    </span>
                  )}
                </label>
                <input
                  type="date"
                  value={ceilingPriceDate}
                  onChange={(e) => setCeilingPriceDate(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--match-border)] transition-all font-sans"
                />
              </div>
            )}
          </div>

          {/* Next Section Step Button */}
          <div className="flex justify-end pt-4 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onNext}
              className="px-5 py-2 rounded-xl bg-[var(--accent-primary-soft)] hover:bg-[var(--accent-primary-soft-strong)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)] font-bold text-xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <span>Next: Lot(s) & Line Items</span>
              <IconArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
