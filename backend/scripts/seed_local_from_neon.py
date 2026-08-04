"""Seed the local Docker Postgres with data from Neon.

Copies every table in the public schema from Neon to local, preserving primary
keys and foreign keys. Uses COPY-style row-by-row inserts with explicit id so
relationships stay intact. Idempotent: existing local rows are left untouched
(INSERT ... ON CONFLICT DO NOTHING).
"""

import asyncio
import os
import re
from datetime import datetime

import asyncpg

from app.config import settings
from app.db.session import normalize_database_url
from urllib.parse import urlsplit, urlunsplit

# Order matters: parent rows must be inserted before children (FKs).
TABLE_ORDER = [
    "users",
    "suppliers",
    "audit_logs",
    "document_evidence",
    "documents",
    "parent_chunks",
    "child_chunks",
    "certificate_verifications",
    "query_cache",
    "chat_sessions",
    "chat_messages",
    "chat_logs",
    "object_storage",
]


def _neon_conn(url: str) -> str:
    p = urlsplit(url)
    return urlunsplit(("postgresql", p.netloc, p.path, p.query, ""))


def _resolve_neon_url() -> str:
    """Prefer NEON_DATABASE_URL_REMOTE from .env (the real Neon), else the env var."""
    env_url = os.getenv("NEON_DATABASE_URL_REMOTE")
    if env_url:
        return env_url
    try:
        env = open(os.path.join(os.path.dirname(__file__), "..", ".env"), encoding="utf-8").read()
        m = re.search(r"^NEON_DATABASE_URL_REMOTE=(.+)$", env, re.M)
        if m:
            return m.group(1).strip()
    except Exception:
        pass
    return settings.neon_database_url


def _py(obj):
    """Convert asyncpg values to plain Python for parameter binding."""
    if isinstance(obj, datetime):
        return obj
    if isinstance(obj, dict):
        return obj
    return obj


async def _table_schema(conn, table: str):
    rows = await conn.fetch(
        """
        SELECT column_name, data_type, udt_name, is_identity
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
        """,
        table,
    )
    return [r["column_name"] for r in rows], [r["udt_name"] for r in rows]


async def copy_table(src, dst, table: str) -> int:
    cols, udts = await _table_schema(src, table)
    if not cols:
        return 0

    # vector columns need explicit ::vector cast in the insert
    col_sql = ", ".join(f'"{c}"' for c in cols)
    placeholders = []
    for i, (c, u) in enumerate(zip(cols, udts), start=1):
        if u == "vector":
            placeholders.append(f"${i}::vector")
        else:
            placeholders.append(f"${i}")
    ph_sql = ", ".join(placeholders)
    on_conflict = ", ".join(f'"{c}"' for c in cols)

    select_sql = f'SELECT {col_sql} FROM "{table}"'
    insert_sql = (
        f'INSERT INTO "{table}" ({col_sql}) VALUES ({ph_sql}) '
        f"ON CONFLICT DO NOTHING"
    )

    n = 0
    for row in await src.fetch(select_sql):
        vals = list(row)
        try:
            await dst.execute(insert_sql, *vals)
            n += 1
        except Exception as e:
            print(f"  !! {table}: skipped a row ({type(e).__name__}): {str(e)[:100]}")
    return n


async def main() -> None:
    neon_url = _neon_conn(normalize_database_url(_resolve_neon_url()))
    local_url = "postgresql://postgres:postgres@localhost:5432/cq_checker"

    src = await asyncpg.connect(neon_url, timeout=30)
    dst = await asyncpg.connect(local_url, timeout=15)

    print(f"Seeding local from Neon ({neon_url[:40]}...)")
    print("-" * 60)

    totals = {}
    for table in TABLE_ORDER:
        exists = await dst.fetchval(
            "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1", table
        )
        if not exists:
            continue
        n = await copy_table(src, dst, table)
        totals[table] = n
        print(f"  {table:<28} {n} rows")

    # Fix sequences after explicit-id inserts (only serial PK tables have seqs)
    await dst.execute("SELECT setval('suppliers_id_seq', (SELECT MAX(id) FROM suppliers))")

    print("-" * 60)
    print("DONE")

    await src.close()
    await dst.close()


if __name__ == "__main__":
    asyncio.run(main())
