import type { ChatSource, FeedbackRating, DocumentSummary, DocumentFolder } from "@/types";

export interface ChatbotProps {
  onGoHome?: () => void;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
  sources?: ChatSource[];
  cacheHit?: boolean;
  costUsd?: number;
  isStreaming?: boolean;
  dbMessageId?: string;
  feedbackGiven?: FeedbackRating;
  debugTracing?: Record<string, unknown>;
}

export interface PdfViewItem {
  fileUrl: string;
  page: number;
  title: string;
  documentId?: string | null;
  contentType?: string | null;
  snippet?: string | null;
}

export interface FeedbackModalProps {
  messageId: string;
  onClose: () => void;
  onSubmit: (messageId: string, rating: FeedbackRating, reason?: string) => Promise<void>;
}

export interface CreateFolderModalProps {
  onClose: () => void;
  onConfirm: (name: string) => Promise<void>;
}

export interface ChatMessageItemProps {
  msg: ChatMessage;
  onOpenCitation: (src: ChatSource) => void;
  onFeedback: (msg: ChatMessage, rating: FeedbackRating) => void;
}
