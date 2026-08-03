"""Migrate historical audit data from Supabase to Neon.

Reads credentials from local environment / .env ONLY (never accepts them as args).
Run this yourself on your machine:

    cd backend
    python -m scripts.migrate_supabase_to_neon --dry-run    # preview first
    python -m scripts.migrate_supabase_to_neon               # perform the migration

Requires in backend/.env:
    SUPABASE_URL=
    SUPABASE_KEY=
    NEON_DATABASE_URL=
"""

import asyncio
import json
import os
import sys
from typing import Any, Dict, List

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.modules["google._upb._message"] = None
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

import requests  # noqa: E402
from sqlalchemy import select, text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker  # noqa: E402

from app.config import settings  # noqa: E402
from app.db.session import Base, normalize_database_url  # noqa: E402
from app.models.tables import Supplier, AuditLog, DocumentEvidence as NeonDocumentEvidence  # noqa: E402

SUPABASE_TABLES = ["supplier_list", "document_evidence", "audit_results"]


# ── Supabase REST helpers (read-only) ─────────────────────────────────────────

def supabase_headers() -> Dict[str, str]:
    if not settings.supabase_url or not settings.supabase_key:
        raise RuntimeError(
            "SUPABASE_URL / SUPABASE_KEY missing. Add them to backend/.env and run from the backend/ directory."
        )
    return {
        "apikey": settings.supabase_key,
        "Authorization": f"Bearer {settings.supabase_key}",
        "Content-Type": "application/json",
    }


def fetch_all(table: str) -> List[Dict[str, Any]]:
    """Fetch every row from a Supabase table via REST API (max 1000 rows/request, paginated)."""
    base = f"{settings.supabase_url.rstrip('/')}/rest/v1/{table}"
    rows: List[Dict[str, Any]] = []
    offset = 0
    while True:
        resp = requests.get(
            base,
            headers=supabase_headers(),
            params={"select": "*", "limit": 1000, "offset": offset},
            timeout=30,
        )
        resp.raise_for_status()
        batch = resp.json()
        rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return rows


# ── Neon write helpers ────────────────────────────────────────────────────────

async def _existing_evidence_keys(session: AsyncSession) -> "Counter":
    """Count of existing document_evidence rows keyed by (audit_id, filename, question_label, timestamp).

    The same file can legitimately appear under multiple question labels
    (a merged PDF may answer several questions), and even identical rows can
    exist (re-run audits). We therefore count occurrences and only insert the
    delta, so every Supabase record is copied while re-runs stay idempotent.
    """
    from collections import Counter
    result = await session.execute(
        select(NeonDocumentEvidence.audit_id, NeonDocumentEvidence.filename,
               NeonDocumentEvidence.ariba_question_label, NeonDocumentEvidence.timestamp)
    )
    return Counter((r[0], r[1], r[2], r[3]) for r in result)


async def _existing_audit_log_ids(session: AsyncSession) -> set:
    result = await session.execute(select(AuditLog.audit_id))
    return {r[0] for r in result}


async def _existing_supplier_ids(session: AsyncSession) -> set:
    result = await session.execute(select(Supplier.id))
    return {r[0] for r in result}


async def migrate_suppliers(session: AsyncSession, dry_run: bool) -> int:
    rows = fetch_all("supplier_list")
    existing = await _existing_supplier_ids(session)
    inserted = 0
    for r in rows:
        sid = int(r.get("supplier_id") or 0)
        if sid in existing:
            continue
        if not dry_run:
            session.add(Supplier(id=sid, supplier_name=str(r.get("supplier_name", "")).strip()))
        existing.add(sid)
        inserted += 1
    return inserted


async def migrate_document_evidence(session: AsyncSession, dry_run: bool) -> int:
    from collections import Counter

    rows = fetch_all("document_evidence")

    # Source occurrence counts per full row identity.
    source_counts: Counter = Counter(
        (str(r.get("audit_id", "")), str(r.get("filename", "")),
         str(r.get("ariba_question_label", "")), str(r.get("timestamp", "")))
        for r in rows
    )
    existing_counts = await _existing_evidence_keys(session)

    inserted = 0
    for r in rows:
        key = (str(r.get("audit_id", "")), str(r.get("filename", "")),
               str(r.get("ariba_question_label", "")), str(r.get("timestamp", "")))
        if existing_counts[key] >= source_counts[key]:
            continue
        if not dry_run:
            session.add(NeonDocumentEvidence(
                audit_id=key[0],
                supplier_id=int(r.get("supplier_id") or 0),
                timestamp=key[3],
                supplier_name=str(r.get("supplier_name", "")),
                filename=key[1],
                ariba_question_label=key[2],
                ariba_qa_answers=str(r.get("ariba_qa_answers", "")),
                gemini_extracted_supplier_name=str(r.get("gemini_extracted_supplier_name", "")),
                gemini_extracted_metadata=str(r.get("gemini_extracted_metadata", "")),
                file_content_type=str(r.get("file_content_type", "")),
                input_tokens=int(r.get("input_tokens") or 0),
                output_tokens=int(r.get("output_tokens") or 0),
                cost_usd=int(r.get("cost_usd") or 0),
                file_hash=r.get("file_hash") or None,
                file_url=r.get("file_url") or None,
            ))
        existing_counts[key] += 1
        inserted += 1
    return inserted


async def migrate_audit_results(session: AsyncSession, dry_run: bool) -> int:
    rows = fetch_all("audit_results")
    existing_ids = await _existing_audit_log_ids(session)
    inserted = 0
    for r in rows:
        audit_id = str(r.get("audit_id", ""))
        if audit_id in existing_ids:
            continue
        comparison_table = r.get("comparison_table")
        if isinstance(comparison_table, str) and comparison_table:
            try:
                comparison_table = json.loads(comparison_table)
            except Exception:
                comparison_table = None
        if not dry_run:
            session.add(AuditLog(
                audit_id=audit_id,
                supplier_id=int(r.get("supplier_id") or 0),
                timestamp=str(r.get("timestamp", "")),
                supplier_name=str(r.get("supplier_name", "")),
                workspace_title=str(r.get("workspace_title") or "Ariba Workspace"),
                complete_qa_data_dump=str(r.get("complete_qa_data_dump") or "[]"),
                compiled_extracted_data=str(r.get("compiled_extracted_data", "")),
                result=str(r.get("result") or "Mismatch"),
                suggested_comment=str(r.get("suggested_comments", "")),
                screenshot_url=r.get("screenshot_url") or None,
                comparison_input_tokens=int(r.get("comparison_input_tokens") or 0),
                comparison_output_tokens=int(r.get("comparison_output_tokens") or 0),
                comparison_cost_usd=int(r.get("comparison_cost_usd") or 0),
                total_run_cost_usd=int(r.get("total_run_cost_usd") or 0),
                comparison_table=comparison_table,
            ))
        existing_ids.add(audit_id)
        inserted += 1
    return inserted


# ── Entry point ───────────────────────────────────────────────────────────────

async def run(dry_run: bool) -> None:
    if not settings.neon_database_url:
        raise RuntimeError("NEON_DATABASE_URL missing. Add it to backend/.env and run from the backend/ directory.")

    engine = create_async_engine(normalize_database_url(settings.neon_database_url), echo=False)

    # Ensure the Neon schema exists (idempotent — creates tables if missing).
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        await conn.run_sync(Base.metadata.create_all)
        # Backfill legacy tables created before the audit_id column existed.
        await conn.execute(text(
            "ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS audit_id VARCHAR(100)"
        ))
        await conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_logs_audit_id ON audit_logs (audit_id)"
        ))
        # Widen gemini_extracted_supplier_name — Supabase stores >500 char values.
        await conn.execute(text(
            "ALTER TABLE document_evidence ALTER COLUMN gemini_extracted_supplier_name TYPE TEXT"
        ))

    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    print(f"{'DRY RUN (no writes) -- ' if dry_run else ''}Source: Supabase -> Target: Neon")
    print(f"  {settings.supabase_url}")
    print("-" * 60)

    async with factory() as session:
        n_suppliers = await migrate_suppliers(session, dry_run)
        n_evidence = await migrate_document_evidence(session, dry_run)
        n_audits = await migrate_audit_results(session, dry_run)
        if not dry_run:
            await session.commit()

    print("Per-table row counts:")
    print(f"  supplier_list      -> suppliers          : {n_suppliers} new")
    print(f"  document_evidence  -> document_evidence  : {n_evidence} new")
    print(f"  audit_results      -> audit_logs         : {n_audits} new")
    print("-" * 60)
    if dry_run:
        print("Dry run complete -- no data written. Re-run without --dry-run to migrate.")
    else:
        print("Migration complete.")

    await engine.dispose()


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    asyncio.run(run(dry_run))


if __name__ == "__main__":
    main()
