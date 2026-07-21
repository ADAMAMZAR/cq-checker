import type { ComparisonTable, DocumentEvidence, SupplierCost } from "@/types";

export function cleanQuestionLabel(label?: string): string {
  if (!label) return '';
  const parts = label.split(/\s+[-–—]\s*|\s*[-–—]\s+/);
  return parts[0] ? parts[0].trim() : label.trim();
}

export function getCommentAndTable(fullComment: string): {
  comment: string;
  table: { headers: string[]; rows: string[][] } | null;
  tables: ComparisonTable[];
} {
  if (!fullComment) return { comment: "", table: null, tables: [] };

  if (fullComment.startsWith("Dear Sir/Madam") || fullComment === "All match." || !fullComment.includes("|")) {
    return { comment: fullComment, table: null, tables: [] };
  }

  if (fullComment.includes(" | Comparison: ")) {
    const parts = fullComment.split(" | Comparison: ");
    const comment = parts[0];
    const rawTable = parts[1] || "";
    if (!rawTable || !rawTable.includes("|")) return { comment, table: null, tables: [] };
    const lines = rawTable.split("\n").map(l => l.trim()).filter(l => l.startsWith("|"));
    if (lines.length < 2) return { comment, table: null, tables: [] };
    const headers = lines[0].split("|").map(h => h.trim()).filter(h => h !== "");
    const rows = lines.slice(2).map(line =>
      line.split("|").map(cell => cell.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
    );
    return { comment, table: { headers, rows }, tables: [] };
  }

  const lines = fullComment.split("\n");
  const tables: ComparisonTable[] = [];
  let currentLabel = "";
  let currentTableLines: string[] = [];
  const commentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("|")) {
      currentTableLines.push(line);
    } else {
      if (currentTableLines.length > 0) {
        if (currentTableLines.length >= 2) {
          const headers = currentTableLines[0].split("|").map(h => h.trim()).filter(h => h !== "");
          const rows = currentTableLines.slice(2).map(l =>
            l.split("|").map(cell => cell.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
          );
          tables.push({ label: currentLabel, headers, rows });
        }
        currentTableLines = [];
        currentLabel = "";
      }
      if (line) {
        if (line.startsWith("Supplier:")) {
          commentLines.push(line);
        } else {
          currentLabel = line;
        }
      }
    }
  }

  if (currentTableLines.length >= 2) {
    const headers = currentTableLines[0].split("|").map(h => h.trim()).filter(h => h !== "");
    const rows = currentTableLines.slice(2).map(l =>
      l.split("|").map(cell => cell.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
    );
    tables.push({ label: currentLabel, headers, rows });
  }

  return { comment: commentLines.join("\n"), table: null, tables };
}

export function getSupplierCosts(evidenceLogs: DocumentEvidence[]): SupplierCost[] {
  const map: Record<string, { name: string; count: number; cost: number }> = {};
  evidenceLogs.forEach(ev => {
    const name = ev.supplier_name || "Unknown Supplier";
    if (!map[name]) {
      map[name] = { name, count: 0, cost: 0.0 };
    }
    const costMyr = ev.cost_myr || (ev.cost_usd ? ev.cost_usd * 4.70 : 0.0);
    map[name].count += 1;
    map[name].cost += costMyr;
  });
  return Object.values(map).sort((a, b) => b.cost - a.cost);
}

export function getLabelSortKey(label: string): number[] {
  const match = label.trim().match(/^(\d+(?:\.\d+)*)/);
  return match ? match[1].split('.').map(Number) : [999];
}

export function parseEvidenceMetadata(ev: DocumentEvidence, targetFields: Record<string, string>): Record<string, string> {
  try {
    const parsed = JSON.parse(ev.gemini_extracted_metadata);
    return {
      certificateOwnerName: parsed.certificateOwnerName || "",
      issuerName: parsed.issuerName || "",
      certificateType: parsed.certificateType || "",
      certificateNumber: parsed.certificateNumber || "",
      yearOfPublication: parsed.yearOfPublication || "",
      expirationDate: parsed.expirationDate || "",
      effectiveDate: parsed.effectiveDate || "",
      certificateLocation: parsed.certificateLocation || ""
    };
  } catch {
    return {
      certificateOwnerName: ev.gemini_extracted_supplier_name || "",
      issuerName: "",
      certificateType: "",
      certificateNumber: "",
      yearOfPublication: "",
      expirationDate: "",
      effectiveDate: "",
      certificateLocation: ""
    };
  }
}
