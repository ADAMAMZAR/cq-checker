"""Read-only database browser for the preview page.

Lists tables in the public schema and returns their rows for display. No
write operations are exposed. Table names are validated against
information_schema (whitelist), so arbitrary SQL injection is not possible.
"""

import logging
from typing import Any, Dict, List

from sqlalchemy import text

from app.db.session import get_session_factory

logger = logging.getLogger(__name__)

# Columns that are binary/huge and not useful to render (e.g. embeddings).
SKIP_COLUMN_UDTS = {"vector", "tsvector"}

# Cap on rows returned per table for the preview.
MAX_PREVIEW_ROWS = 500


async def list_tables() -> List[Dict[str, Any]]:
    """Return all public tables with estimated row counts (metadata only)."""
    factory = get_session_factory()
    async with factory() as session:
        rows = await session.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' "
                "ORDER BY table_name"
            )
        )
        tables = [r[0] for r in rows]
        result = []
        for t in tables:
            try:
                count = await session.execute(text(f'SELECT count(*) FROM "{t}"'))
                row_count = count.scalar() or 0
            except Exception:
                row_count = None
            result.append({"name": t, "row_count": row_count})
    return result


async def get_columns(table: str) -> List[str]:
    """Return renderable column names for a table."""
    factory = get_session_factory()
    async with factory() as session:
        rows = await session.execute(
            text(
                "SELECT column_name, udt_name FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = :t ORDER BY ordinal_position"
            ),
            {"t": table},
        )
        return [r[0] for r in rows if r[1] not in SKIP_COLUMN_UDTS]


async def get_full_schema() -> Dict[str, Any]:
    """Return the full public schema for the Schema Viewer.

    Output shape:
        {
          "tables": [
            {
              "name": "suppliers",
              "row_count": 42,
              "columns": [
                {
                  "name": "id",
                  "type": "integer",
                  "type_display": "INT",
                  "nullable": false,
                  "default": None,
                  "is_primary_key": true,
                  "is_foreign_key": false,
                  "references": None,        # {table, column} if FK
                },
                ...
              ],
              "primary_keys": ["id"],
              "indexes": ["uq_audit_logs_audit_id", ...],
            },
            ...
          ],
          "relationships": [
            # unique, sorted list of FK edges
            {"from_table": "audit_logs", "from_column": "supplier_id",
             "to_table": "suppliers", "to_column": "id"},
            ...
          ],
        }

    Uses information_schema + pg_constraint + pg_index only; no row data
    is touched. Safe to call on the read-only preview path.
    """
    factory = get_session_factory()
    async with factory() as session:
        # 1. All tables in public schema.
        tables_rows = await session.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' "
                "ORDER BY table_name"
            )
        )
        table_names = [r[0] for r in tables_rows]

        # 2. All columns across all tables in one query, joined to
        #    pg_attribute for ordinal position and default expression.
        cols_rows = await session.execute(
            text(
                """
                SELECT c.table_name,
                       c.column_name,
                       c.data_type,
                       c.udt_name,
                       c.is_nullable,
                       c.column_default,
                       c.ordinal_position
                FROM information_schema.columns c
                WHERE c.table_schema = 'public'
                ORDER BY c.table_name, c.ordinal_position
                """
            )
        )
        # Map: table -> [column dicts]
        columns_by_table: Dict[str, List[Dict[str, Any]]] = {t: [] for t in table_names}
        for r in cols_rows:
            tname, cname, dtype, udt, nullable, default, _ord = r
            columns_by_table.setdefault(tname, []).append({
                "name": cname,
                "type": udt,
                "type_display": _short_type(udt, dtype),
                "nullable": nullable == "YES",
                "default": default,
            })

        # 3. Primary keys (one or many) per table.
        pk_rows = await session.execute(
            text(
                """
                SELECT tc.table_name, kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema = kcu.table_schema
                WHERE tc.table_schema = 'public'
                  AND tc.constraint_type = 'PRIMARY KEY'
                ORDER BY tc.table_name, kcu.ordinal_position
                """
            )
        )
        pk_set: Dict[str, set] = {t: set() for t in table_names}
        for tname, cname in pk_rows:
            pk_set.setdefault(tname, set()).add(cname)
        for tname, cols in columns_by_table.items():
            for col in cols:
                col["is_primary_key"] = col["name"] in pk_set.get(tname, set())
                col["is_foreign_key"] = False  # filled in step 4
                col["references"] = None

        # 4. Foreign keys (composite or simple) with referenced table/column.
        fk_rows = await session.execute(
            text(
                """
                SELECT
                    tc.table_name              AS from_table,
                    kcu.column_name            AS from_column,
                    ccu.table_name             AS to_table,
                    ccu.column_name            AS to_column,
                    tc.constraint_name         AS constraint_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu
                  ON ccu.constraint_name = tc.constraint_name
                 AND ccu.table_schema = tc.table_schema
                WHERE tc.table_schema = 'public'
                  AND tc.constraint_type = 'FOREIGN KEY'
                ORDER BY tc.table_name, kcu.ordinal_position
                """
            )
        )
        relationships: List[Dict[str, Any]] = []
        fk_index: Dict[str, Dict[str, Dict[str, str]]] = {}  # table -> col -> {table,column,constraint}
        for from_t, from_c, to_t, to_c, cname in fk_rows:
            fk_index.setdefault(from_t, {})[from_c] = {
                "table": to_t,
                "column": to_c,
                "constraint": cname,
            }
            relationships.append({
                "from_table": from_t,
                "from_column": from_c,
                "to_table": to_t,
                "to_column": to_c,
                "constraint": cname,
            })

        for tname, cols in columns_by_table.items():
            for col in cols:
                ref = fk_index.get(tname, {}).get(col["name"])
                if ref:
                    col["is_foreign_key"] = True
                    col["references"] = {"table": ref["table"], "column": ref["column"]}

        # 5. Indexes (non-PK) per table.
        idx_rows = await session.execute(
            text(
                """
                SELECT t.relname AS table_name,
                       i.relname AS index_name
                FROM pg_class t
                JOIN pg_index x  ON x.indrelid = t.oid
                JOIN pg_class i  ON i.oid = x.indexrelid
                JOIN pg_namespace n ON n.oid = t.relnamespace
                WHERE n.nspname = 'public'
                  AND t.relkind = 'r'
                  AND x.indisprimary = false
                ORDER BY t.relname, i.relname
                """
            )
        )
        idx_by_table: Dict[str, List[str]] = {}
        for tname, iname in idx_rows:
            if tname not in table_names:
                continue
            idx_by_table.setdefault(tname, []).append(iname)

        # 6. Row counts (best-effort, fast path).
        result: List[Dict[str, Any]] = []
        for tname in table_names:
            try:
                rc = await session.execute(text(f'SELECT count(*) FROM "{tname}"'))
                row_count = int(rc.scalar() or 0)
            except Exception:
                row_count = None
            result.append({
                "name": tname,
                "row_count": row_count,
                "columns": columns_by_table.get(tname, []),
                "primary_keys": sorted(pk_set.get(tname, set())),
                "indexes": idx_by_table.get(tname, []),
            })

    # Dedupe relationships (a composite FK produces one row per column).
    seen = set()
    unique_rels = []
    for r in relationships:
        key = (r["from_table"], r["from_column"], r["to_table"], r["to_column"])
        if key in seen:
            continue
        seen.add(key)
        unique_rels.append(r)

    return {"tables": result, "relationships": unique_rels}


def _short_type(udt: str, data_type: str) -> str:
    """Short type label for display in the schema viewer."""
    display_map = {
        "vector": "VECTOR",
        "tsvector": "TSVECTOR",
        "jsonb": "JSONB",
        "uuid": "UUID",
        "int4": "INT",
        "int8": "BIGINT",
        "numeric": "NUMERIC",
        "bool": "BOOL",
        "timestamp": "TIMESTAMP",
        "timestamptz": "TIMESTAMPTZ",
        "text": "TEXT",
        "varchar": "VARCHAR",
        "char": "CHAR",
        "date": "DATE",
        "time": "TIME",
        "bytea": "BYTEA",
    }
    if udt in display_map:
        return display_map[udt]
    return (udt or data_type or "?").upper()


async def get_table_data(table: str, limit: int = 100, offset: int = 0) -> Dict[str, Any]:
    """Return a page of rows for a validated table name.

    ``limit`` is clamped to ``MAX_PREVIEW_ROWS``. The table name must already be
    validated by the caller against ``list_tables``.
    """
    limit = max(1, min(int(limit), MAX_PREVIEW_ROWS))
    offset = max(0, int(offset))
    columns = await get_columns(table)
    if not columns:
        return {"table": table, "columns": [], "rows": [], "total": 0, "limit": limit, "offset": offset}

    factory = get_session_factory()
    async with factory() as session:
        total_row = await session.execute(text(f'SELECT count(*) FROM "{table}"'))
        total = total_row.scalar() or 0

        col_sql = ", ".join(f'"{c}"' for c in columns)
        data = await session.execute(
            text(f'SELECT {col_sql} FROM "{table}" ORDER BY 1 LIMIT :lim OFFSET :off'),
            {"lim": limit, "off": offset},
        )
        rows = []
        for record in data:
            rows.append([_stringify(v) for v in record])

    return {
        "table": table,
        "columns": columns,
        "rows": rows,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


def _stringify(value: Any) -> str:
    """Render a cell value as a display string, flattening JSON/dates."""
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        import json
        try:
            return json.dumps(value, ensure_ascii=False, default=str)
        except Exception:
            return str(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)
