import type { SupplierEntry } from "@/types";
import type {
  AribaQuestionnaireItem,
  AribaQuestionnaireAnswersResponse,
} from "@/lib/api";

export interface SupplierAuditProps {
  onNavigateToRegistry?: (supplierName: string) => void;
}

export const STAGES = [
  "Downloading attachment files from SAP Ariba",
  "Extracting PDF evidence via Gemini 3.5 Flash (QA Context Injected)",
  "Running Python compliance auditor & persisting to Registry",
];

export interface SupplierComboboxProps {
  query: string;
  open: boolean;
  highlighted: number;
  filtered: SupplierEntry[];
  selectedSupplier: SupplierEntry | null;
  error: string | null;
  onQueryChange: (val: string) => void;
  onOpenChange: (open: boolean) => void;
  onHighlightedChange: (idx: number) => void;
  onSelectSupplier: (sup: SupplierEntry) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export interface QuestionnaireListProps {
  selectedSupplier: SupplierEntry;
  loadingQuestionnaires: boolean;
  questionnaires: AribaQuestionnaireItem[];
  selectedQuestionnaire: AribaQuestionnaireItem | null;
  onSelectQuestionnaire: (q: AribaQuestionnaireItem) => void;
}

export interface CertificateAnswersPanelProps {
  selectedQuestionnaire: AribaQuestionnaireItem;
  loadingAnswers: boolean;
  answersData: AribaQuestionnaireAnswersResponse | null;
  certifiedQuestionsWithAttachments: any[];
  running: boolean;
  onRunVerification: (e: React.FormEvent) => void;
}

export interface AuditPipelineProgressProps {
  running: boolean;
  selectedSupplier: SupplierEntry | null;
  stage: number;
}

export interface AuditVerdictCardProps {
  auditResult: any;
  selectedSupplier: SupplierEntry | null;
  running: boolean;
  onNavigateToRegistry?: (supplierName: string) => void;
}
