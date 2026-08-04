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
