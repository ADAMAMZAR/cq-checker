"""
Re-run the comparison audit on existing records stored in your database.
Reads existing extracted metadata + QA data from the database, runs the
new auditor engine (code-based, no AI), and writes back the updated
comparison tables, verdicts, and suggested comments.

Usage:
    python reaudit_db.py                              # re-audit ALL records
    python reaudit_db.py --audit-id AUDIT_0001        # single record
    python reaudit_db.py --dry-run                    # preview only, no writes
    python reaudit_db.py --supplier "ACME Corp"       # filter by supplier
"""

import sys
sys.modules['google._upb._message'] = None

import os
os.environ['PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION'] = 'python'

import json
import logging
import argparse
from datetime import datetime
from typing import List, Optional

# Suppress gspread/oauth debug noise
logging.basicConfig(level=logging.WARNING)

from app.config import settings
from app.schemas import AuditLogEntry, DocumentEvidence
from app.services import sheets, auditor


def get_db_backend() -> str:
    if settings.supabase_url and settings.supabase_key:
        return "supabase"
    if settings.google_apps_script_url:
        return "apps_script"
    try:
        sheets.get_sheets_client()
        return "google_sheets"
    except Exception:
        return "unknown"


def build_audit_context(doc: DocumentEvidence) -> tuple:
    """Build (file_context, extracted_data_dict) from a DocumentEvidence record."""
    try:
        metadata = json.loads(doc.gemini_extracted_metadata) if doc.gemini_extracted_metadata else {}
    except Exception:
        metadata = {}

    file_ctx = {
        "filename": doc.filename,
        "ariba_question_label": doc.ariba_question_label,
        "ariba_qa_answers": doc.ariba_qa_answers,
    }
    return file_ctx, metadata


def detect_qa_title_from_docs(docs: List[DocumentEvidence]) -> str:
    """Build a title string for region detection from question labels."""
    titles = []
    for d in docs[:5]:
        if d.ariba_question_label:
            titles.append(d.ariba_question_label)
    return " ".join(titles)


def read_local_qa_json(supplier_name: str) -> str:
    """Try to read workspaceTitle from the local qa_data.json file."""
    from pathlib import Path
    safe = "".join(c for c in supplier_name if c.isalnum() or c in (" ", "_", "-")).strip()
    qa_path = Path("uploads") / safe / "qa_data.json"
    if qa_path.exists():
        try:
            with open(str(qa_path), encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                return data.get("workspaceTitle", "") or ""
        except Exception:
            pass
    return ""


def build_workspace_map(audit_logs, all_evidence) -> dict:
    """Build a mapping of audit_id -> workspace_title.
    Tries (1) complete_qa_data_dump JSON, (2) local qa_data.json files, (3) workspace_title field.
    """
    wm = {}
    for log in audit_logs:
        aid = str(getattr(log, "audit_id", "")).strip()
        if not aid:
            continue

        wt = ""

        dump = getattr(log, "complete_qa_data_dump", None) or ""
        if dump and len(dump) > 4:
            try:
                parsed = json.loads(dump)
                if isinstance(parsed, dict):
                    wt = parsed.get("workspaceTitle", "") or ""
            except Exception:
                pass

        if not wt:
            sup = getattr(log, "supplier_name", "") or ""
            wt = read_local_qa_json(sup)

        if not wt:
            wt = getattr(log, "workspace_title", None) or ""

        wm[aid] = wt
    return wm


def reaudit_run(supplier_name: str, docs: List[DocumentEvidence],
                workspace_title: str = "", dry_run: bool = False,
                force_region: Optional[str] = None) -> Optional[dict]:
    """Re-audit a single audit run's documents and update the database."""

    file_contexts = []
    extraction_results = []

    for doc in docs:
        ctx, metadata = build_audit_context(doc)
        file_contexts.append(ctx)
        extraction_results.append(metadata)

    if not file_contexts:
        return None

    qa_title = detect_qa_title_from_docs(docs)
    if workspace_title and len(workspace_title) > 3 and "ariba" not in workspace_title.lower():
        qa_title = f"{workspace_title} {qa_title}"

    # Allow manual region override — prepend to title so detect_region picks it up
    if force_region:
        tag = "(Australia)" if force_region.lower() == "australia" else "(Malaysia)"
        qa_title = f"{tag} {qa_title}"

    verdict, comment, comp_table = auditor.run_full_audit(
        supplier_name,
        file_contexts,
        extraction_results,
        qa_data_title=qa_title,
    )

    result = {
        "supplier": supplier_name,
        "audit_ids": list(set(d.audit_id for d in docs)),
        "document_count": len(docs),
        "region": comp_table["region"],
        "verdict": verdict,
        "suggested_comment": comment,
        "comparison_table": comp_table,
    }

    if dry_run:
        return result

    # Write back to database — update each audit_id found
    audit_ids = set(d.audit_id for d in docs)
    for aid in audit_ids:
        success = sheets.update_audit_result(
            audit_id=aid,
            result=verdict,
            suggested_comment=comment,
            comparison_table=comp_table,
        )
        if success:
            result.setdefault("updated_ids", []).append(aid)

    return result


def print_result(result: dict, index: int, total: int):
    print(f"\n[{index}/{total}] {result['supplier']}")
    print(f"  Region:   {result['region']}")
    print(f"  Verdict:  {result['verdict']}")
    print(f"  Docs:     {result['document_count']}")
    if "updated_ids" in result:
        print(f"  Updated:  {', '.join(result['updated_ids'])}")
    print(f"  Comment:  {result['suggested_comment'][:200]}...")


def main():
    parser = argparse.ArgumentParser(
        description="Re-run comparison audit on existing database records."
    )
    parser.add_argument("--audit-id", "-a", default=None,
                        help="Re-audit a specific audit ID only")
    parser.add_argument("--supplier", "-s", default=None,
                        help="Re-audit a specific supplier name only")
    parser.add_argument("--dry-run", "-n", action="store_true",
                        help="Preview results without writing to database")
    parser.add_argument("--region", "-r", default=None,
                        choices=["australia", "malaysia"],
                        help="Force region for all records (overrides auto-detection)")
    args = parser.parse_args()

    backend = get_db_backend()
    if backend == "unknown":
        print("ERROR: No database configured.")
        print("Set one of the following in your .env file:")
        print("  SUPABASE_URL + SUPABASE_KEY")
        print("  GOOGLE_APPS_SCRIPT_URL")
        print("  GOOGLE_CREDS_PATH / GOOGLE_CREDS_JSON + GOOGLE_SHEET_NAME")
        sys.exit(1)

    print(f"Database backend: {backend}")
    if args.dry_run:
        print("*** DRY RUN — no changes will be written ***")
    print()

    # Fetch existing records
    all_evidence = sheets.get_document_evidence_logs()
    if not all_evidence:
        print("No document evidence records found in database.")
        sys.exit(0)

    print(f"Total document evidence records: {len(all_evidence)}")

    # Fetch audit logs for workspace_title region detection
    try:
        all_logs = sheets.get_audit_logs()
        workspace_map = build_workspace_map(all_logs, all_evidence)
        print(f"Total audit logs fetched: {len(all_logs)}")
    except Exception as e:
        workspace_map = {}
        print(f"Warning: could not fetch audit logs: {e}")

    # Filter
    if args.audit_id:
        all_evidence = [d for d in all_evidence if str(d.audit_id).strip() == args.audit_id.strip()]
        if not all_evidence:
            print(f"No records found for audit ID: {args.audit_id}")
            sys.exit(1)
        print(f"Filtered to audit ID: {args.audit_id}")

    # Group by supplier_name (each audit run is grouped by supplier + question labels)
    groups = {}
    for doc in all_evidence:
        key = doc.supplier_name.strip()
        if args.supplier and key.lower() != args.supplier.strip().lower():
            continue
        groups.setdefault(key, []).append(doc)

    if not groups:
        print("No matching records found.")
        sys.exit(0)

    if args.supplier:
        print(f"Filtered to supplier: {args.supplier}")

    print(f"Supplier groups to re-audit: {len(groups)}")
    print()

    total = len(groups)
    succeeded = 0
    skipped = 0

    for idx, (supplier_name, docs) in enumerate(sorted(groups.items()), 1):
        # Get workspace title from the first doc's audit_id
        first_aid = docs[0].audit_id if docs else ""
        wt = workspace_map.get(first_aid, "")
        result = reaudit_run(supplier_name, docs, workspace_title=wt,
                             dry_run=args.dry_run, force_region=args.region)
        if result:
            print_result(result, idx, total)
            succeeded += 1
        else:
            print(f"[{idx}/{total}] {supplier_name} — SKIPPED (no usable documents)")
            skipped += 1

    print(f"\n{'='*50}")
    print(f"Done.  Re-audited: {succeeded}  Skipped: {skipped}")
    if args.dry_run:
        print("*** DRY RUN — no data was modified ***")


if __name__ == "__main__":
    main()
