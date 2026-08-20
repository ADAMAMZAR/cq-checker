import type { EventType, LotItem } from "../types";

export interface CompilePayloadParams {
  eventType: EventType;
  eventName: string;
  intervalTime: string;
  biddingDate: string;
  startTimeHour: string;
  startTimeMin: string;
  startTimeAmpm: string;
  closeTimeHour: string;
  closeTimeMin: string;
  closeTimeAmpm: string;
  bidCurrency: string;
  minimumBidDecrement: string;
  bidBufferAmount: string;
  biddingBasis: string;
  ceilingPriceRef: string;
  ceilingPriceDate: string;
  primaryContactName: string;
  primaryContactCode: string;
  primaryContactPhone: string;
  primaryContactEmail: string;
  secondaryContactName: string;
  secondaryContactCode: string;
  secondaryContactPhone: string;
  secondaryContactEmail: string;
  recipientEmail: string;
  lots: LotItem[];
}

export function compileAuctionPayload(params: CompilePayloadParams) {
  const isSpecial = params.eventType === "Japanese" || params.eventType === "Dutch";
  const requiresTimingInput = isSpecial || params.eventType === "Seal Bid";
  const isTrafficLightEmail = params.eventType === "Traffic Light (Ceiling Price send via Email)";

  const compiledStartTimeStr = `${params.startTimeHour}:${params.startTimeMin.padStart(2, "0")} ${params.startTimeAmpm}`;
  const compiledCloseTimeStr = `${params.closeTimeHour}:${params.closeTimeMin.padStart(2, "0")} ${params.closeTimeAmpm}`;

  let lotDescriptionString = "";
  const compiledMatrixArray: any[] = [];
  if (requiresTimingInput && params.intervalTime) {
    lotDescriptionString += `Interval Time: ${params.intervalTime} Minutes\n\n`;
  }

  let totalLines = 0;
  let dynamicTrackingUsesLines = false;

  params.lots.forEach((lot, lotIdx) => {
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
  let ceilingRefValue = params.ceilingPriceRef.trim();
  if (isTrafficLightEmail && params.ceilingPriceDate) {
    const d = new Date(params.ceilingPriceDate);
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

  return {
    eventType: params.eventType,
    eventName: params.eventName,
    numberOfLots: dynamicTrackingUsesLines
      ? `1 Lot, ${totalLines} Line Items`
      : `${params.lots.length} ${params.lots.length === 1 ? "Lot" : "Lots"}`,
    lotDescription: lotDescriptionString.trim(),
    biddingDate: params.biddingDate,
    startTime: compiledStartTimeStr,
    scheduledBiddingCloseTime: compiledCloseTimeStr,
    bidCurrency: params.bidCurrency,
    minimumBidDecrement: params.minimumBidDecrement,
    bidBufferAmount: params.bidBufferAmount,
    biddingBasis: params.biddingBasis,
    ceilingPriceDocumentReference: ceilingRefValue,
    primaryContactName: params.primaryContactName,
    primaryContactPhone: `${params.primaryContactCode} ${params.primaryContactPhone.trim()}`,
    primaryContactEmail: params.primaryContactEmail,
    secondaryContactName: params.secondaryContactName,
    secondaryContactPhone: `${params.secondaryContactCode} ${params.secondaryContactPhone.trim()}`,
    secondaryContactEmail: params.secondaryContactEmail,
    recipientEmail: params.recipientEmail,
    intervalTime: params.intervalTime,
    matrixData: compiledMatrixArray,
  };
}
