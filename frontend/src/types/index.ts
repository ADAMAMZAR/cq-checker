// ── Database Browser (Admin) ────────────────────────────────────────────────

export interface DbTableMeta {
  name: string;
  row_count: number | null;
}

export interface DbTableData {
  table: string;
  columns: string[];
  rows: string[][];
  total: number;
  limit: number;
  offset: number;
  primary_keys?: string[];
}

// ── Auth & RBAC ─────────────────────────────────────────────────────────────

export interface RoleInfo {
  id?: string;
  name: string;
  display_name: string;
  description: string;
  feature_ids: string[];
  test_user?: string | null;
}

export interface FeatureInfo {
  id: string;
  display_name: string;
  description: string;
  route_path?: string | null;
  is_external?: boolean;
  sort_order?: number;
}

export interface RolesAndFeaturesResponse {
  roles: RoleInfo[];
  features: FeatureInfo[];
}