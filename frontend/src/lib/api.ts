import type { AuditLog, DocumentEvidence, SupplierAssets, CostAnalyticsData } from "@/types";

const BASE = "http://127.0.0.1:8000/api";

export async function fetchAuditLogs(): Promise<AuditLog[]> {
  const res = await fetch(`${BASE}/logs`);
  if (!res.ok) throw new Error(`Failed to load logs: HTTP ${res.status}`);
  const data: AuditLog[] = await res.json();
  return data;
}

export async function fetchSupplierAssets(supplierId: number): Promise<SupplierAssets> {
  const res = await fetch(`${BASE}/logs/${supplierId}/assets`);
  if (res.ok) return res.json();
  return { screenshots: [], documents: [] };
}

export async function fetchCostAnalytics(): Promise<CostAnalyticsData> {
  const res = await fetch(`${BASE}/costs`);
  if (!res.ok) throw new Error(`Failed to load cost analytics: HTTP ${res.status}`);
  return res.json();
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
