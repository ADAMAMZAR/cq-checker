"""
Revert audit results to old-style comparison using the original
gemini.run_programmatic_audit() function (fuzzy matching, all 8 fields).

Usage (run from backend/):
    python -m scripts.revert_to_legacy_audit
"""

import sys
sys.modules['google._upb._message'] = None

import os
os.environ['PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION'] = 'python'

import json
import asyncio
import logging
logging.basicConfig(level=logging.WARNING)

from app.services import audit_data_access
from app.services.legacy_gemini_audit import run_programmatic_audit


async def main():
    all_evidence = await audit_data_access.get_document_evidence_logs()
    print(f"Found {len(all_evidence)} document evidence records")

    groups = {}
    for doc in all_evidence:
        groups.setdefault(doc.supplier_name.strip(), []).append(doc)

    print(f"Grouped into {len(groups)} suppliers")

    count = 0
    for supplier_name, docs in sorted(groups.items()):
        file_contexts = []
        extraction_results = []

        for doc in docs:
            try:
                metadata = json.loads(doc.gemini_extracted_metadata) if doc.gemini_extracted_metadata else {}
            except Exception:
                metadata = {}

            file_contexts.append({
                "filename": doc.filename,
                "ariba_question_label": doc.ariba_question_label,
                "ariba_qa_answers": doc.ariba_qa_answers,
            })
            extraction_results.append(metadata)

        if not file_contexts:
            continue

        verdict, comment, comp_table = run_programmatic_audit(
            supplier_name, file_contexts, extraction_results
        )

        audit_ids = set(d.audit_id for d in docs)
        for aid in audit_ids:
            ok = await audit_data_access.update_audit_result(aid, verdict, comment, comp_table)
            if ok:
                count += 1
                print(f"  Reverted {aid} ({supplier_name})")

    print(f"\nReverted {count} audit records to old-style results")


if __name__ == "__main__":
    asyncio.run(main())
