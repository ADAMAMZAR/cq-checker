import type { AuditLog, DocumentEvidence, SupplierAssets, FormFields } from "@/types";

const BASE = "http://127.0.0.1:8000/api";

export async function fetchAuditLogs(): Promise<AuditLog[]> {
  const res = await fetch(`${BASE}/logs`);
  if (!res.ok) throw new Error(`Failed to load logs: HTTP ${res.status}`);
  return res.json();
}

export async function fetchSupplierAssets(supplierName: string): Promise<SupplierAssets> {
  const res = await fetch(`${BASE}/logs/${encodeURIComponent(supplierName)}/assets`);
  if (res.ok) return res.json();
  return { screenshots: [], documents: [] };
}

export async function fetchEvidenceLogs(): Promise<DocumentEvidence[]> {
  const res = await fetch(`${BASE}/evidence`);
  if (res.ok) return res.json();
  throw new Error("Failed to load document evidence logs");
}

export async function updateEvidenceMetadata(
  auditId: string,
  filename: string,
  updatedMetadata: Record<string, string>
): Promise<any> {
  const res = await fetch(`${BASE}/evidence`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audit_id: auditId, filename, updated_metadata: updatedMetadata })
  });
  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.detail || "Failed to save.");
  }
  return res.json();
}
