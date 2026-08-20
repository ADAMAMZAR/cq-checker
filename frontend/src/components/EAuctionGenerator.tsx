"use client";

import { useState } from "react";
import {
  IconGavel, IconChevronDown, IconChevronRight, IconPlus, IconTrash,
  IconCheck, IconAlertTriangle, IconLoader2, IconSend, IconUser, IconArrowRight
} from "@tabler/icons-react";

export type EventType =
  | ""
  | "Japanese"
  | "Traffic Light"
  | "Traffic Light - Show Green When Best Bid"
  | "Dutch"
  | "Seal Bid"
  | "Reversed Auction - Show Own Rank"
  | "Reversed Auction - Leading"
  | "Forward Auction"
  | "Traffic Light (Ceiling Price send via Email)";

export interface LineItem {
  id: string;
  description: string;
  startPrice: string;
  stepPrice: string;
}

export interface LotItem {
  id: string;
  title: string;
  startPrice: string;
  stepPrice: string;
  lines: LineItem[];
}

const REGIONAL_COUNTRY_CODES = [
  { code: "+60", label: "Malaysia (+60)" },
  { code: "+61", label: "Australia (+61)" },
  { code: "+84", label: "Vietnam (+84)" },
  { code: "+886", label: "Taiwan (+886)" },
  { code: "+65", label: "Singapore (+65)" },
  { code: "+44", label: "United Kingdom (+44)" },
  { code: "+91", label: "India (+91)" },
  { code: "+974", label: "Qatar (+974)" },
  { code: "+973", label: "Bahrain (+973)" },
];

export default function EAuctionGenerator() {
  // Accordion Sections Open State
  const [openSections, setOpenSections] = useState({
    eventInfo: true,
    lots: false,
    contacts: false,
    recipient: false,
  });

  // Section 1: Event Info State
  const [eventType, setEventType] = useState<EventType>("");
  const [eventName, setEventName] = useState("");
  const [intervalTime, setIntervalTime] = useState("");
  const [biddingDate, setBiddingDate] = useState("");

  const [startTimeHour, setStartTimeHour] = useState("2");
  const [startTimeMin, setStartTimeMin] = useState("30");
  const [startTimeAmpm, setStartTimeAmpm] = useState("PM");

  const [closeTimeHour, setCloseTimeHour] = useState("4");
  const [closeTimeMin, setCloseTimeMin] = useState("00");
  const [closeTimeAmpm, setCloseTimeAmpm] = useState("PM");

  const [bidCurrency, setBidCurrency] = useState("RM");
  const [minimumBidDecrement, setMinimumBidDecrement] = useState("");
  const [bidBufferAmount, setBidBufferAmount] = useState("");
  const [biddingBasis, setBiddingBasis] = useState("per lot");

  const [ceilingPriceRef, setCeilingPriceRef] = useState("");
  const [ceilingPriceDate, setCeilingPriceDate] = useState("");

  // Section 2: Lots & Line Items State
  const [lots, setLots] = useState<LotItem[]>([
    {
      id: "lot-1",
      title: "",
      startPrice: "",
      stepPrice: "",
      lines: [],
    },
  ]);

  // Section 3: Contact Info State
  const [primaryContactName, setPrimaryContactName] = useState("");
  const [primaryContactCode, setPrimaryContactCode] = useState("+60");
  const [primaryContactPhone, setPrimaryContactPhone] = useState("");
  const [primaryContactEmail, setPrimaryContactEmail] = useState("");

  const [secondaryContactName, setSecondaryContactName] = useState("");
  const [secondaryContactCode, setSecondaryContactCode] = useState("+60");
  const [secondaryContactPhone, setSecondaryContactPhone] = useState("");
  const [secondaryContactEmail, setSecondaryContactEmail] = useState("");

  // Section 4: Recipient Email State
  const [recipientEmail, setRecipientEmail] = useState("");

  // Submission / Status State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
    payloadPreview?: any;
  } | null>(null);

  // Derived Logic for Special Auction Types
  const isSpecial = eventType === "Japanese" || eventType === "Dutch";
  const requiresTimingInput = isSpecial || eventType === "Seal Bid";
  const isTrafficLightEmail = eventType === "Traffic Light (Ceiling Price send via Email)";
  const isForwardAuction = eventType === "Forward Auction";

  const decrementIncrementLabel = isForwardAuction
    ? "Minimum Bid Increment *"
    : "Minimum Bid Decrement *";

  const decrementIncrementPlaceholder = isForwardAuction ? "e.g. 500" : "e.g. 3";

  const priceStepLabel = eventType === "Japanese" ? "Bid Decrement Amount" : "Bid Increment Amount";

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const openSection = (section: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: true }));
  };

  // Lot Management Helpers
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

  // Form Submission Handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatusMessage({
      type: "info",
      text: "Validating E-Auction configuration & compiling payload...",
    });

    const compiledStartTimeStr = `${startTimeHour}:${startTimeMin.padStart(2, "0")} ${startTimeAmpm}`;
    const compiledCloseTimeStr = `${closeTimeHour}:${closeTimeMin.padStart(2, "0")} ${closeTimeAmpm}`;

    let lotDescriptionString = "";
    let compiledMatrixArray: any[] = [];
    if (requiresTimingInput && intervalTime) {
      lotDescriptionString += `Interval Time: ${intervalTime} Minutes\n\n`;
    }

    let totalLines = 0;
    let dynamicTrackingUsesLines = false;

    lots.forEach((lot, lotIdx) => {
      const lotTitle = lot.title.trim();
      if (lot.lines.length > 0) {
        dynamicTrackingUsesLines = true;
        lotDescriptionString += `[Lot ${lotTitle}]\n`;

        compiledMatrixArray.push({
          no: `${lotIdx + 1}.`,
          lot: `3.${lotIdx + 1}`,
          line: "",
          cleanText: lotTitle,
          startPrice: "",
          stepPrice: "",
          isHeaderRow: true,
        });

        lot.lines.forEach((line, lineIdx) => {
          if (line.description.trim()) {
            lotDescriptionString += `${line.description.trim()}\n`;
            totalLines++;
            compiledMatrixArray.push({
              no: "",
              lot: "",
              line: `3.${lotIdx + 1}.${lineIdx + 1}`,
              cleanText: line.description.trim(),
              startPrice: line.startPrice,
              stepPrice: line.stepPrice,
              isHeaderRow: false,
            });
          }
        });
        lotDescriptionString += "\n";
      } else {
        lotDescriptionString += `${lotTitle}\n`;
        compiledMatrixArray.push({
          no: `${lotIdx + 1}.`,
          lot: `3.${lotIdx + 1}`,
          line: "",
          cleanText: lotTitle,
          startPrice: lot.startPrice,
          stepPrice: lot.stepPrice,
          isHeaderRow: true,
        });
      }
    });

    // Formatted Ordinal Date for Email Reference Date
    let ceilingRefValue = ceilingPriceRef.trim();
    if (isTrafficLightEmail && ceilingPriceDate) {
      const d = new Date(ceilingPriceDate);
      const day = d.getDate();
      let suffix = "th";
      if (day < 11 || day > 13) {
        switch (day % 10) {
          case 1:
            suffix = "st";
            break;
          case 2:
            suffix = "nd";
            break;
          case 3:
            suffix = "rd";
            break;
        }
      }
      const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ];
      const formattedEmailDate = `${day}${suffix} ${months[d.getMonth()]} ${d.getFullYear()}`;
      ceilingRefValue = `${ceilingRefValue}, dated: ${formattedEmailDate}`;
    }

    const payload = {
      eventType,
      eventName,
      numberOfLots: dynamicTrackingUsesLines
        ? `1 Lot, ${totalLines} Line Items`
        : `${lots.length} ${lots.length === 1 ? "Lot" : "Lots"}`,
      lotDescription: lotDescriptionString.trim(),
      biddingDate,
      startTime: compiledStartTimeStr,
      scheduledBiddingCloseTime: compiledCloseTimeStr,
      bidCurrency,
      minimumBidDecrement,
      bidBufferAmount,
      biddingBasis,
      ceilingPriceDocumentReference: ceilingRefValue,
      primaryContactName,
      primaryContactPhone: `${primaryContactCode} ${primaryContactPhone.trim()}`,
      primaryContactEmail,
      secondaryContactName,
      secondaryContactPhone: `${secondaryContactCode} ${secondaryContactPhone.trim()}`,
      secondaryContactEmail,
      recipientEmail,
      intervalTime,
      matrixData: compiledMatrixArray,
    };

    setTimeout(() => {
      setIsSubmitting(false);
      setStatusMessage({
        type: "success",
        text: `Official E-Auction Event Document for "${eventName}" successfully generated! Document notification queued for ${recipientEmail}.`,
        payloadPreview: payload,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 1000);
  };

  return (
    <div className="flex-1 flex flex-col w-full max-w-5xl mx-auto pb-16 animate-fade-in">
      {/* Page Title Descriptor */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[var(--accent-primary-soft)] border border-[var(--accent-primary-border)] text-xs font-bold uppercase tracking-wider text-[var(--accent-primary-text)] mb-3">
          <IconGavel className="w-4 h-4 text-[var(--accent-primary-text)]" />
          Gamuda E-Auction Workspace
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--heading-color)] tracking-tight">
          E-Auction Document Generator
        </h1>
        <p className="text-xs sm:text-sm text-[var(--text-tertiary)] max-w-xl mx-auto mt-2">
          Issue and generate official Event Information document structures for Gamuda Group Procurement operations.
        </p>
      </div>

      {/* Status Alert Banner */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl mb-6 border text-xs sm:text-sm flex flex-col gap-2 shadow-lg transition-all animate-fade-in ${statusMessage.type === "success"
            ? "bg-[var(--match-bg)] border-[var(--match-border)] text-[var(--match-text)]"
            : statusMessage.type === "error"
              ? "bg-[var(--mismatch-bg)] border-[var(--accent-danger-border)] text-[var(--mismatch-text)]"
              : "bg-[var(--bg-surface)] border-[var(--border-visible)] text-[var(--text-primary)]"
            }`}
        >
          <div className="flex items-center gap-2.5 font-semibold">
            {statusMessage.type === "success" ? (
              <IconCheck className="w-5 h-5 shrink-0" />
            ) : statusMessage.type === "error" ? (
              <IconAlertTriangle className="w-5 h-5 shrink-0" />
            ) : (
              <IconLoader2 className="w-5 h-5 animate-spin shrink-0 text-[var(--accent-primary-text)]" />
            )}
            <span>{statusMessage.text}</span>
          </div>

          {statusMessage.payloadPreview && (
            <div className="mt-3 p-3 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-[11px] space-y-2 overflow-x-auto text-[var(--text-primary)]">
              <div className="font-bold text-[var(--heading-color)] font-sans border-b border-[var(--border-subtle)] pb-1 flex justify-between items-center">
                <span>Compiled Event Payload JSON</span>
                <span className="text-[10px] text-[var(--accent-success)] uppercase tracking-wider font-mono">Status: Ready</span>
              </div>
              <pre className="text-[10px] leading-relaxed max-h-60 overflow-y-auto">
                {JSON.stringify(statusMessage.payloadPreview, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SECTION 1: AUCTION EVENT INFORMATION */}
        <div className="rounded-xl border border-[var(--border-visible)] bg-[var(--bg-card)] shadow-md overflow-hidden transition-all duration-300">
          <button
            type="button"
            onClick={() => toggleSection("eventInfo")}
            className="w-full px-6 py-4 flex items-center justify-between bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-2.5">
              <span className="h-6 w-6 rounded-full bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] font-bold text-xs flex items-center justify-center border border-[var(--accent-primary-border)]">1</span>
              <h2 className="text-base font-bold text-[var(--heading-color)] tracking-wide uppercase">
                Auction Event Information
              </h2>
            </div>
            <div className="text-[var(--text-tertiary)] flex items-center gap-2 text-xs font-semibold">
              <span>{openSections.eventInfo ? "Collapse" : "Expand"}</span>
              {openSections.eventInfo ? (
                <IconChevronDown className="w-4 h-4" />
              ) : (
                <IconChevronRight className="w-4 h-4" />
              )}
            </div>
          </button>

          {openSections.eventInfo && (
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
                    <option value="" disabled>Select Event Type</option>
                    <option value="Japanese">Japanese</option>
                    <option value="Traffic Light">Traffic Light</option>
                    <option value="Traffic Light - Show Green When Best Bid">Traffic Light - Show Green When Best Bid</option>
                    <option value="Dutch">Dutch</option>
                    <option value="Seal Bid">Seal Bid</option>
                    <option value="Reversed Auction - Show Own Rank">Reversed Auction - Show Own Rank</option>
                    <option value="Reversed Auction - Leading">Reversed Auction - Leading</option>
                    <option value="Forward Auction">Forward Auction</option>
                    <option value="Traffic Light (Ceiling Price send via Email)">Traffic Light (Ceiling Price send via Email)</option>
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
                      isTrafficLightEmail
                        ? "e.g. issuer@gamuda.com.my"
                        : "e.g. GAMUDA/REF/2026"
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
                  onClick={() => openSection("lots")}
                  className="px-5 py-2 rounded-xl bg-[var(--accent-primary-soft)] hover:bg-[var(--accent-primary-soft-strong)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)] font-bold text-xs transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <span>Next: Lot(s) & Line Items</span>
                  <IconArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2: LOT(S) & LINE ITEMS */}
        <div className="rounded-xl border border-[var(--border-visible)] bg-[var(--bg-card)] shadow-md overflow-hidden transition-all duration-300">
          <button
            type="button"
            onClick={() => toggleSection("lots")}
            className="w-full px-6 py-4 flex items-center justify-between bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-2.5">
              <span className="h-6 w-6 rounded-full bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] font-bold text-xs flex items-center justify-center border border-[var(--accent-primary-border)]">2</span>
              <h2 className="text-base font-bold text-[var(--heading-color)] tracking-wide uppercase">
                Lot(s) & Line Items ({lots.length})
              </h2>
            </div>
            <div className="text-[var(--text-tertiary)] flex items-center gap-2 text-xs font-semibold">
              <span>{openSections.lots ? "Collapse" : "Expand"}</span>
              {openSections.lots ? (
                <IconChevronDown className="w-4 h-4" />
              ) : (
                <IconChevronRight className="w-4 h-4" />
              )}
            </div>
          </button>

          {openSections.lots && (
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
                            className="px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold transition-all flex items-center gap-1 active:scale-95"
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
                                className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all shrink-0 active:scale-95"
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
                  className="px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-visible)] text-xs font-bold text-[var(--heading-color)] transition-all active:scale-95 flex items-center gap-2 shadow-sm"
                >
                  <IconPlus className="w-4 h-4 text-[var(--match-text)]" />
                  <span>Add New Lot Section</span>
                </button>
              </div>

              {/* Next Section Step Button */}
              <div className="flex justify-end pt-4 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => openSection("contacts")}
                  className="px-5 py-2 rounded-xl bg-[var(--accent-primary-soft)] hover:bg-[var(--accent-primary-soft-strong)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)] font-bold text-xs transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <span>Next: Contact Information</span>
                  <IconArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 3: CONTACT INFORMATION */}
        <div className="rounded-xl border border-[var(--border-visible)] bg-[var(--bg-card)] shadow-md overflow-hidden transition-all duration-300">
          <button
            type="button"
            onClick={() => toggleSection("contacts")}
            className="w-full px-6 py-4 flex items-center justify-between bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-2.5">
              <span className="h-6 w-6 rounded-full bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] font-bold text-xs flex items-center justify-center border border-[var(--accent-primary-border)]">3</span>
              <h2 className="text-base font-bold text-[var(--heading-color)] tracking-wide uppercase">
                Contact Information
              </h2>
            </div>
            <div className="text-[var(--text-tertiary)] flex items-center gap-2 text-xs font-semibold">
              <span>{openSections.contacts ? "Collapse" : "Expand"}</span>
              {openSections.contacts ? (
                <IconChevronDown className="w-4 h-4" />
              ) : (
                <IconChevronRight className="w-4 h-4" />
              )}
            </div>
          </button>

          {openSections.contacts && (
            <div className="p-6 space-y-6 animate-fade-in">
              {/* Primary Contact */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-[var(--heading-color)] uppercase tracking-wider border-b border-[var(--border-subtle)] pb-2 flex items-center gap-2">
                  <IconUser className="w-4 h-4 text-[var(--accent-primary-text)]" />
                  <span>Primary Contact (Contact 1)</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                      Name <span className="text-[var(--mismatch-text)]">*</span>
                    </label>
                    <input
                      type="text"
                      value={primaryContactName}
                      onChange={(e) => setPrimaryContactName(e.target.value)}
                      placeholder="e.g. Ahmad Razak"
                      required
                      className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                      Phone <span className="text-[var(--mismatch-text)]">*</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={primaryContactCode}
                        onChange={(e) => setPrimaryContactCode(e.target.value)}
                        placeholder="+60"
                        required
                        className="w-24 px-2.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-center font-mono font-semibold text-[var(--text-primary)]"
                      />
                      <input
                        type="text"
                        value={primaryContactPhone}
                        onChange={(e) => setPrimaryContactPhone(e.target.value.replace(/[^0-9]/g, ""))}
                        placeholder="112223333"
                        required
                        className="flex-1 px-3 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm font-mono text-[var(--text-primary)]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                      Email <span className="text-[var(--mismatch-text)]">*</span>
                    </label>
                    <input
                      type="email"
                      value={primaryContactEmail}
                      onChange={(e) => setPrimaryContactEmail(e.target.value)}
                      placeholder="ahmad.razak@gamuda.com.my"
                      required
                      className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)]"
                    />
                  </div>
                </div>
              </div>

              {/* Secondary Contact */}
              <div className="space-y-4 pt-4 border-t border-[var(--border-subtle)]">
                <h3 className="text-xs font-bold text-[var(--heading-color)] uppercase tracking-wider border-b border-[var(--border-subtle)] pb-2 flex items-center gap-2">
                  <IconUser className="w-4 h-4 text-[var(--text-tertiary)]" />
                  <span>Secondary Contact (Contact 2)</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                      Name <span className="text-[var(--mismatch-text)]">*</span>
                    </label>
                    <input
                      type="text"
                      value={secondaryContactName}
                      onChange={(e) => setSecondaryContactName(e.target.value)}
                      placeholder="e.g. Sarah Lee"
                      required
                      className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                      Phone <span className="text-[var(--mismatch-text)]">*</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={secondaryContactCode}
                        onChange={(e) => setSecondaryContactCode(e.target.value)}
                        placeholder="+60"
                        required
                        className="w-24 px-2.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-center font-mono font-semibold text-[var(--text-primary)]"
                      />
                      <input
                        type="text"
                        value={secondaryContactPhone}
                        onChange={(e) => setSecondaryContactPhone(e.target.value.replace(/[^0-9]/g, ""))}
                        placeholder="123456789"
                        required
                        className="flex-1 px-3 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm font-mono text-[var(--text-primary)]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                      Email <span className="text-[var(--mismatch-text)]">*</span>
                    </label>
                    <input
                      type="email"
                      value={secondaryContactEmail}
                      onChange={(e) => setSecondaryContactEmail(e.target.value)}
                      placeholder="sarah.lee@gamuda.com.my"
                      required
                      className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)]"
                    />
                  </div>
                </div>
              </div>

              {/* Next Section Step Button */}
              <div className="flex justify-end pt-4 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => openSection("recipient")}
                  className="px-5 py-2 rounded-xl bg-[var(--accent-primary-soft)] hover:bg-[var(--accent-primary-soft-strong)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)] font-bold text-xs transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <span>Next: Recipient Detail</span>
                  <IconArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 4: RECIPIENT DETAIL */}
        <div className="rounded-xl border border-[var(--border-visible)] bg-[var(--bg-card)] shadow-md overflow-hidden transition-all duration-300">
          <button
            type="button"
            onClick={() => toggleSection("recipient")}
            className="w-full px-6 py-4 flex items-center justify-between bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-2.5">
              <span className="h-6 w-6 rounded-full bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] font-bold text-xs flex items-center justify-center border border-[var(--accent-primary-border)]">4</span>
              <h2 className="text-base font-bold text-[var(--heading-color)] tracking-wide uppercase">
                Recipient Detail
              </h2>
            </div>
            <div className="text-[var(--text-tertiary)] flex items-center gap-2 text-xs font-semibold">
              <span>{openSections.recipient ? "Collapse" : "Expand"}</span>
              {openSections.recipient ? (
                <IconChevronDown className="w-4 h-4" />
              ) : (
                <IconChevronRight className="w-4 h-4" />
              )}
            </div>
          </button>

          {openSections.recipient && (
            <div className="p-6 space-y-4 animate-fade-in">
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                  Recipient Distribution Email Address <span className="text-[var(--mismatch-text)]">*</span>
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="e.g. vendor.desk@gamuda.com.my"
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)]"
                />
                <p className="text-[11px] text-[var(--text-tertiary)] mt-1.5">
                  The finalized official document will be sent to this email address.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="text-center pt-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-8 py-3.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-sm font-bold tracking-wide transition-all shadow-lg hover:shadow-xl active:scale-98 flex items-center gap-2.5 mx-auto disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <IconLoader2 className="w-5 h-5 animate-spin" />
                <span>Processing & Generating Document...</span>
              </>
            ) : (
              <>
                <IconSend className="w-5 h-5" />
                <span>Generate & Issue Official Documents</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
