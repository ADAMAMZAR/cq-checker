"use client";

import { useState } from "react";
import { IconGavel, IconLoader2, IconSend } from "@tabler/icons-react";
import type { EventType, LotItem, OpenSections, StatusMessage } from "./eauction-generator/types";
import { compileAuctionPayload } from "./eauction-generator/utils/payloadCompiler";
import StatusBanner from "./eauction-generator/components/StatusBanner";
import EventInfoSection from "./eauction-generator/sections/EventInfoSection";
import LotsSection from "./eauction-generator/sections/LotsSection";
import ContactsSection from "./eauction-generator/sections/ContactsSection";
import RecipientSection from "./eauction-generator/sections/RecipientSection";

export default function EAuctionGenerator() {
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

  // Form Submission Handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatusMessage({
      type: "info",
      text: "Validating E-Auction configuration & compiling payload...",
    });

    const payload = compileAuctionPayload({
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
      {statusMessage && <StatusBanner statusMessage={statusMessage} />}

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
        <div className="text-center pt-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-8 py-3.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-sm font-bold tracking-wide transition-all shadow-lg hover:shadow-xl active:scale-98 flex items-center gap-2.5 mx-auto disabled:opacity-50 cursor-pointer"
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