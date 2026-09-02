"use client";

import React from "react";
import {
  IconBuilding,
  IconFileText,
  IconGavel,
  IconCheck,
  IconCalendar,
  IconClock,
  IconUser,
  IconMail,
  IconPhone,
  IconPrinter,
  IconDownload,
} from "@tabler/icons-react";
import { formatMalaysiaDate } from "@/lib/dateUtils";

interface LiveDocumentPreviewProps {
  payload: any;
  onDownloadDocx?: () => void;
}

export default function LiveDocumentPreview({ payload, onDownloadDocx }: LiveDocumentPreviewProps) {
  const isSpecialEvent = payload.eventType === "Japanese" || payload.eventType === "Dutch";
  const isTrafficLightEmail = payload.eventType === "Traffic Light (Ceiling Price send via Email)";

  return (
    <div className="flex flex-col h-full w-full bg-[var(--bg-card)] rounded-2xl border border-[var(--border-visible)] shadow-lg overflow-hidden">
      {/* Live Preview Header Toolbar */}
      <div className="px-5 py-3.5 bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)]">
            <IconFileText className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-[var(--heading-color)]">Live Template Preview</h3>
            <p className="text-[10px] text-[var(--text-tertiary)]">A4 Real-Time Document Output</p>
          </div>
        </div>

        {onDownloadDocx && (
          <button
            type="button"
            onClick={onDownloadDocx}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0078d4] hover:bg-[#006cc1] text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            <IconDownload className="w-3.5 h-3.5" />
            <span>Export .docx</span>
          </button>
        )}
      </div>

      {/* A4 Paper Document Container */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-900/50 dark:bg-slate-950/60">
        <div className="max-w-[720px] mx-auto bg-white text-slate-900 rounded-xl shadow-2xl border border-slate-300 p-6 sm:p-10 font-sans space-y-6 text-xs leading-relaxed">
          {/* 1. Official Corporate Header */}
          <div className="border-b-2 border-[#c8102e] pb-4 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[#c8102e] font-extrabold text-sm tracking-tight">
                <IconBuilding className="w-5 h-5 shrink-0" />
                <span>GAMUDA GROUP PROCUREMENT OFFICE</span>
              </div>
              <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight mt-1">
                E-AUCTION EVENT INFORMATION DOCUMENT
              </h1>
              <p className="text-[11px] text-slate-500 font-medium">
                SAP Ariba Sourcing Event & Procurement Compliance Log
              </p>
            </div>
            <div className="text-right">
              <span className="inline-block px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-300 font-mono text-[10px] font-bold uppercase">
                {payload.eventType || "Standard Event"}
              </span>
            </div>
          </div>

          {/* 2. Event Summary Parameters Grid */}
          <div className="space-y-2">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#c8102e] flex items-center gap-1.5">
              <span>1. Event Parameters & Schedule</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-[11px]">
              <div>
                <span className="font-semibold text-slate-500 block">Event Name:</span>
                <span className="font-bold text-slate-900 font-mono break-words">
                  {payload.eventName || "(Not specified)"}
                </span>
              </div>

              <div>
                <span className="font-semibold text-slate-500 block">Event Type:</span>
                <span className="font-bold text-slate-900">
                  {payload.eventType || "(Select event type)"}
                </span>
              </div>

              <div>
                <span className="font-semibold text-slate-500 block">Number of Lots / Lines:</span>
                <span className="font-bold text-slate-900">{payload.numberOfLots}</span>
              </div>

              <div>
                <span className="font-semibold text-slate-500 block">Bid Currency:</span>
                <span className="font-bold text-[#c8102e] font-mono">{payload.bidCurrency || "MYR"}</span>
              </div>

              <div>
                <span className="font-semibold text-slate-500 block">Bidding Date:</span>
                <span className="font-bold text-slate-900 flex items-center gap-1">
                  <IconCalendar className="w-3.5 h-3.5 text-slate-400" />
                  {payload.biddingDate ? formatMalaysiaDate(payload.biddingDate) : "(Not specified)"}
                </span>
              </div>

              <div>
                <span className="font-semibold text-slate-500 block">Scheduled Start & Close Time:</span>
                <span className="font-bold text-slate-900 flex items-center gap-1 font-mono">
                  <IconClock className="w-3.5 h-3.5 text-slate-400" />
                  {payload.startTime} - {payload.scheduledBiddingCloseTime}
                </span>
              </div>

              {isSpecialEvent && (
                <div>
                  <span className="font-semibold text-slate-500 block">Interval Time per Round:</span>
                  <span className="font-bold text-amber-700">
                    {payload.intervalTime ? `${payload.intervalTime} Minutes` : "(Not specified)"}
                  </span>
                </div>
              )}

              <div>
                <span className="font-semibold text-slate-500 block">Minimum Bid Decrement:</span>
                <span className="font-bold text-slate-900">
                  {payload.minimumBidDecrement || "Per Lot basis"}
                </span>
              </div>

              <div>
                <span className="font-semibold text-slate-500 block">Bid Buffer Amount:</span>
                <span className="font-bold text-slate-900">{payload.bidBufferAmount || "N/A"}</span>
              </div>

              <div>
                <span className="font-semibold text-slate-500 block">Bidding Basis:</span>
                <span className="font-bold text-slate-900">{payload.biddingBasis || "Total Lot Value"}</span>
              </div>

              {payload.ceilingPriceDocumentReference && (
                <div className="sm:col-span-2">
                  <span className="font-semibold text-slate-500 block">Ceiling Price Reference:</span>
                  <span className="font-mono text-[10px] text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200 inline-block">
                    {payload.ceilingPriceDocumentReference}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 3. Event Rules & Operating Terms Notice */}
          <div className="space-y-1.5 p-3 bg-amber-500/5 rounded-lg border border-amber-500/20 text-[11px] text-slate-700">
            <h2 className="font-bold text-amber-800 text-xs flex items-center gap-1">
              <span>2. Special Rules & Instructions</span>
            </h2>
            <ul className="list-disc list-inside space-y-1 text-[10.5px]">
              <li>Bidders must submit all bids strictly within the scheduled bidding window.</li>
              {isSpecialEvent && (
                <li className="font-semibold text-amber-900">
                  This is a {payload.eventType} Auction with dynamic rounds interval of {payload.intervalTime || "X"} minutes per round.
                </li>
              )}
              {isTrafficLightEmail && (
                <li className="font-semibold text-amber-900">
                  Ceiling prices will be dispatched directly to authorized vendor emails prior to event commencement.
                </li>
              )}
              <li>All bids submitted are legally binding and final upon auction closing.</li>
            </ul>
          </div>

          {/* 4. Lot & Line Items Schedule Matrix */}
          <div className="space-y-2">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#c8102e]">
              3. Lot & Line Item Structure
            </h2>
            {payload.matrixData && payload.matrixData.length > 0 ? (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                      <th className="py-2 px-3 border-r border-slate-200 w-12">No.</th>
                      <th className="py-2 px-3 border-r border-slate-200">Item Description</th>
                      <th className="py-2 px-3 border-r border-slate-200 w-28 text-right">Start Price</th>
                      <th className="py-2 px-3 w-28 text-right">Step Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {payload.matrixData.map((row: any, idx: number) => (
                      <tr
                        key={idx}
                        className={row.isHeaderRow ? "bg-slate-50 font-bold text-slate-900" : "bg-white text-slate-700"}
                      >
                        <td className="py-1.5 px-3 border-r border-slate-200 font-mono text-[10px]">
                          {row.no || row.line || row.lot}
                        </td>
                        <td className="py-1.5 px-3 border-r border-slate-200">
                          {row.cleanText}
                        </td>
                        <td className="py-1.5 px-3 border-r border-slate-200 text-right font-mono font-semibold">
                          {row.startPrice ? `${payload.bidCurrency || "MYR"} ${row.startPrice}` : "-"}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono font-semibold">
                          {row.stepPrice ? `${payload.bidCurrency || "MYR"} ${row.stepPrice}` : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-slate-50 border border-dashed border-slate-300 text-center text-slate-400 text-[11px]">
                No lots or line items added yet. Fill section 2 in the form to populate table.
              </div>
            )}
          </div>

          {/* 5. GPO Support Contact Points */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#c8102e]">
              4. Authorized GPO Contacts
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
              {/* Primary Contact */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <span className="font-bold text-slate-800 block flex items-center gap-1">
                  <IconUser className="w-3.5 h-3.5 text-[#c8102e]" />
                  Primary GPO Contact:
                </span>
                <p className="font-semibold text-slate-900">{payload.primaryContactName || "(Not specified)"}</p>
                <p className="text-slate-600 flex items-center gap-1 font-mono text-[10px]">
                  <IconPhone className="w-3 h-3 text-slate-400" />
                  {payload.primaryContactPhone}
                </p>
                <p className="text-slate-600 flex items-center gap-1 font-mono text-[10px] truncate">
                  <IconMail className="w-3 h-3 text-slate-400" />
                  {payload.primaryContactEmail || "(Not specified)"}
                </p>
              </div>

              {/* Secondary Contact */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <span className="font-bold text-slate-800 block flex items-center gap-1">
                  <IconUser className="w-3.5 h-3.5 text-slate-500" />
                  Secondary GPO Contact:
                </span>
                <p className="font-semibold text-slate-900">{payload.secondaryContactName || "(Not specified)"}</p>
                <p className="text-slate-600 flex items-center gap-1 font-mono text-[10px]">
                  <IconPhone className="w-3 h-3 text-slate-400" />
                  {payload.secondaryContactPhone}
                </p>
                <p className="text-slate-600 flex items-center gap-1 font-mono text-[10px] truncate">
                  <IconMail className="w-3 h-3 text-slate-400" />
                  {payload.secondaryContactEmail || "(Not specified)"}
                </p>
              </div>
            </div>
          </div>

          {/* Footer Document Metadata Stamp */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400">
            <span>Gamuda Berhad — Group Procurement Office Confidential</span>
            <span className="font-mono">Ref: GPO-E-AUCTION-DOC</span>
          </div>
        </div>
      </div>
    </div>
  );
}
