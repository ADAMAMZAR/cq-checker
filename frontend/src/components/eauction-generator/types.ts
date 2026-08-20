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

export interface OpenSections {
  eventInfo: boolean;
  lots: boolean;
  contacts: boolean;
  recipient: boolean;
}

export const REGIONAL_COUNTRY_CODES = [
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

export interface StatusMessage {
  type: "success" | "error" | "info";
  text: string;
  payloadPreview?: any;
}
