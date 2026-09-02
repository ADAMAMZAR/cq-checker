"use client";

import { useState, useMemo } from "react";
import {
  IconGavel,
  IconLoader2,
  IconSend,
  IconLayoutColumns,
  IconFileText,
  IconEdit,
} from "@tabler/icons-react";
import type { EventType, LotItem, OpenSections, StatusMessage } from "./eauction-generator/types";
import { compileAuctionPayload } from "./eauction-generator/utils/payloadCompiler";
import StatusBanner from "./eauction-generator/components/StatusBanner";
import EventInfoSection from "./eauction-generator/sections/EventInfoSection";
import LotsSection from "./eauction-generator/sections/LotsSection";
import ContactsSection from "./eauction-generator/sections/ContactsSection";
import RecipientSection from "./eauction-generator/sections/RecipientSection";
import LiveDocumentPreview from "./eauction-generator/components/LiveDocumentPreview";

export default function EAuctionGenerator() {
  // Layout View Mode state: "split" | "form" | "preview"
  const [viewMode, setViewMode] = useState<"split" | "form" | "preview">("split");

  // Accordion Sections Open State
  const [openSections, setOpenSections] = useState<OpenSections>({
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
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);

  const toggleSection = (section: keyof OpenSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const openSection = (section: keyof OpenSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: true }));
  };

  // Dynamically compile payload in real-time as user types
  const livePayload = useMemo(() => {
    return compileAuctionPayload({
      eventType,
      eventName,
      intervalTime,
      biddingDate,
      startTimeHour,
      startTimeMin,
      startTimeAmpm,
      closeTimeHour,
      closeTimeMin,
      closeTimeAmpm,
      bidCurrency,
      minimumBidDecrement,
      bidBufferAmount,
      biddingBasis,
      ceilingPriceRef,
      ceilingPriceDate,
      primaryContactName,
      primaryContactCode,
      primaryContactPhone,
      primaryContactEmail,
      secondaryContactName,
      secondaryContactCode,
      secondaryContactPhone,
      secondaryContactEmail,
      recipientEmail,
      lots,
    });
  }, [
    eventType,
    eventName,
    intervalTime,
    biddingDate,
    startTimeHour,
    startTimeMin,
    startTimeAmpm,
    closeTimeHour,
    closeTimeMin,
    closeTimeAmpm,
    bidCurrency,
    minimumBidDecrement,
    bidBufferAmount,
    biddingBasis,
    ceilingPriceRef,
    ceilingPriceDate,
    primaryContactName,
    primaryContactCode,
    primaryContactPhone,
    primaryContactEmail,
    secondaryContactName,
    secondaryContactCode,
    secondaryContactPhone,
    secondaryContactEmail,
    recipientEmail,
    lots,
  ]);

  // Form Submission Handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatusMessage({
      type: "info",
      text: "Validating E-Auction configuration & compiling payload...",
    });

    setTimeout(() => {
      setIsSubmitting(false);
      setStatusMessage({
        type: "success",
        text: `Official E-Auction Event Document for "${eventName || "Event"}" successfully generated! Document notification queued for ${recipientEmail || "recipient"}.`,
        payloadPreview: livePayload,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 1000);
  };

  return (
    <div className="flex-1 flex flex-col w-full max-w-[1600px] mx-auto pb-16 animate-fade-in">
      {/* Page Header & View Toggle Control */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--heading-color)] tracking-tight">
            E-Auction Document Generator
          </h1>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Real-time side-by-side template editor for Gamuda Group Procurement E-Auctions.
          </p>
        </div>

        {/* View Switcher Pills */}
        <div className="flex items-center gap-1.5 bg-[var(--bg-elevated)] p-1 rounded-xl border border-[var(--border-subtle)] self-start md:self-auto">
          <button
            type="button"
            onClick={() => setViewMode("split")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === "split"
                ? "bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)] shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--heading-color)]"
            }`}
          >
            <IconLayoutColumns className="w-3.5 h-3.5" />
            <span>Split View</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("form")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === "form"
                ? "bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)] shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--heading-color)]"
            }`}
          >
            <IconEdit className="w-3.5 h-3.5" />
            <span>Form Only</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("preview")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === "preview"
                ? "bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)] shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--heading-color)]"
            }`}
          >
            <IconFileText className="w-3.5 h-3.5" />
            <span>Preview Only</span>
          </button>
        </div>
      </div>

      {/* Status Alert Banner */}
      {statusMessage && <StatusBanner statusMessage={statusMessage} />}

      {/* Side-by-Side Split Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Form Inputs */}
        <div
          className={`space-y-6 ${
            viewMode === "preview"
              ? "hidden"
              : viewMode === "form"
              ? "lg:col-span-12 max-w-4xl mx-auto w-full"
              : "lg:col-span-6 xl:col-span-5"
          }`}
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* SECTION 1: AUCTION EVENT INFORMATION */}
            <EventInfoSection
              isOpen={openSections.eventInfo}
              onToggle={() => toggleSection("eventInfo")}
              onNext={() => openSection("lots")}
              eventType={eventType}
              setEventType={setEventType}
              eventName={eventName}
              setEventName={setEventName}
              intervalTime={intervalTime}
              setIntervalTime={setIntervalTime}
              biddingDate={biddingDate}
              setBiddingDate={setBiddingDate}
              startTimeHour={startTimeHour}
              setStartTimeHour={setStartTimeHour}
              startTimeMin={startTimeMin}
              setStartTimeMin={setStartTimeMin}
              startTimeAmpm={startTimeAmpm}
              setStartTimeAmpm={setStartTimeAmpm}
              closeTimeHour={closeTimeHour}
              setCloseTimeHour={setCloseTimeHour}
              closeTimeMin={closeTimeMin}
              setCloseTimeMin={setCloseTimeMin}
              closeTimeAmpm={closeTimeAmpm}
              setCloseTimeAmpm={setCloseTimeAmpm}
              bidCurrency={bidCurrency}
              setBidCurrency={setBidCurrency}
              minimumBidDecrement={minimumBidDecrement}
              setMinimumBidDecrement={setMinimumBidDecrement}
              bidBufferAmount={bidBufferAmount}
              setBidBufferAmount={setBidBufferAmount}
              biddingBasis={biddingBasis}
              setBiddingBasis={setBiddingBasis}
              ceilingPriceRef={ceilingPriceRef}
              setCeilingPriceRef={setCeilingPriceRef}
              ceilingPriceDate={ceilingPriceDate}
              setCeilingPriceDate={setCeilingPriceDate}
            />

            {/* SECTION 2: LOT(S) & LINE ITEMS */}
            <LotsSection
              isOpen={openSections.lots}
              onToggle={() => toggleSection("lots")}
              onNext={() => openSection("contacts")}
              eventType={eventType}
              lots={lots}
              setLots={setLots}
            />

            {/* SECTION 3: CONTACT INFORMATION */}
            <ContactsSection
              isOpen={openSections.contacts}
              onToggle={() => toggleSection("contacts")}
              onNext={() => openSection("recipient")}
              primaryContactName={primaryContactName}
              setPrimaryContactName={setPrimaryContactName}
              primaryContactCode={primaryContactCode}
              setPrimaryContactCode={setPrimaryContactCode}
              primaryContactPhone={primaryContactPhone}
              setPrimaryContactPhone={setPrimaryContactPhone}
              primaryContactEmail={primaryContactEmail}
              setPrimaryContactEmail={setPrimaryContactEmail}
              secondaryContactName={secondaryContactName}
              setSecondaryContactName={setSecondaryContactName}
              secondaryContactCode={secondaryContactCode}
              setSecondaryContactCode={setSecondaryContactCode}
              secondaryContactPhone={secondaryContactPhone}
              setSecondaryContactPhone={setSecondaryContactPhone}
              secondaryContactEmail={secondaryContactEmail}
              setSecondaryContactEmail={setSecondaryContactEmail}
            />

            {/* SECTION 4: RECIPIENT DETAIL */}
            <RecipientSection
              isOpen={openSections.recipient}
              onToggle={() => toggleSection("recipient")}
              recipientEmail={recipientEmail}
              setRecipientEmail={setRecipientEmail}
            />

            {/* Action Button */}
            <div className="text-center pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-sm font-bold tracking-wide transition-all shadow-lg hover:shadow-xl active:scale-98 flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <IconLoader2 className="w-5 h-5 animate-spin" />
                    <span>Generating Official Document...</span>
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

        {/* RIGHT COLUMN: Real-Time Live Document Preview */}
        <div
          className={`${
            viewMode === "form"
              ? "hidden"
              : viewMode === "preview"
              ? "lg:col-span-12 max-w-4xl mx-auto w-full h-[calc(100vh-140px)]"
              : "lg:col-span-6 xl:col-span-7 h-[calc(100vh-140px)] sticky top-20"
          }`}
        >
          <LiveDocumentPreview
            payload={livePayload}
            onDownloadDocx={() => {
              // Trigger docx generation via submit or backend downloader
              const form = document.querySelector("form");
              if (form) form.requestSubmit();
            }}
          />
        </div>
      </div>
    </div>
  );
}