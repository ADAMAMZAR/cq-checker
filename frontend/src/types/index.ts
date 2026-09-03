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

// ── Schema Viewer (Admin ERD-style visualisation) ───────────────────────────

export interface DbColumnMeta {
  name: string;
  type: string;            // raw Postgres UDT: "uuid", "varchar", "numeric", ...
  type_display: string;    // human-friendly: "UUID", "VARCHAR", "NUMERIC"
  nullable: boolean;
  default: string | null;
  is_primary_key: boolean;
  is_foreign_key: boolean;
  references: { table: string; column: string } | null;
}

export interface DbTableSchema {
  name: string;
  row_count: number | null;
  columns: DbColumnMeta[];
  primary_keys: string[];
  indexes: string[];
}

export interface DbRelationship {
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
  constraint: string;
}

export interface DbSchema {
  tables: DbTableSchema[];
  relationships: DbRelationship[];
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
