import os
import sys
import json
import logging

# Ensure backend folder is in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Force pure Python Protobuf
sys.modules['google._upb._message'] = None
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

from app.config import settings
from app.services import sheets, gemini

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("reconstruct")

def main():
    logger.info("Starting comparison table reconstruction for existing database entries...")

    # 1. Fetch all audit logs
    logger.info("Fetching audit results from database...")
    audit_logs = sheets.get_audit_logs()
    existing_audit_ids = {log.audit_id for log in audit_logs}
    logger.info(f"Found {len(audit_logs)} existing audit results.")

    # 2. Fetch all document evidence logs
    logger.info("Fetching document evidence logs from database...")
    evidence_logs = sheets.get_document_evidence_logs()
    logger.info(f"Found {len(evidence_logs)} document evidence records.")

    # Group evidence by audit_id
    evidence_by_audit = {}
    for ev in evidence_logs:
        audit_id = ev.audit_id
        if audit_id not in evidence_by_audit:
            evidence_by_audit[audit_id] = []
        evidence_by_audit[audit_id].append(ev)

    updated_count = 0
    created_count = 0

    # 3. For each unique audit_id in evidence, run programmatic audit and update/create
    for audit_id, docs in evidence_by_audit.items():
        if not docs:
            continue

        # Determine supplier details from evidence
        first_doc = docs[0]
        supplier_name = first_doc.supplier_name
        timestamp = first_doc.timestamp
        supplier_id = first_doc.supplier_id

        # Try to find workspace title and certificate type from document
        workspace_title = "Scraped Ariba workspace"
        cert_type = "Relational evidence"

        # Try to get expiration date
        expiration_date = "N/A"
        for doc in docs:
            try:
                meta = json.loads(doc.gemini_extracted_metadata)
                if "expirationDate" in meta and meta["expirationDate"] != "N/A":
                    expiration_date = meta["expirationDate"]
                    break
            except Exception:
                pass

        file_contexts = []
        extracted_results = []
        compiled_docs = []
        for doc in docs:
            file_contexts.append({
                "filename": doc.filename,
                "ariba_question_label": doc.ariba_question_label,
                "ariba_qa_answers": doc.ariba_qa_answers
            })
            try:
                meta = json.loads(doc.gemini_extracted_metadata)
            except Exception:
                meta = {}
            extracted_results.append(meta)

            compiled_docs.append({
                "filename": doc.filename,
                "extracted_data": meta,
                "input_tokens": doc.input_tokens,
                "output_tokens": doc.output_tokens,
                "cost_usd": doc.cost_usd
            })

        # Run programmatic comparison
        new_result, new_comment, comparison_table_dict = gemini.run_programmatic_audit(
            supplier_name,
            file_contexts,
            extracted_results
        )

        if audit_id in existing_audit_ids:
            logger.info(f"Updating existing audit {audit_id} for supplier '{supplier_name}'...")
            success = sheets.update_audit_result(audit_id, new_result, new_comment, comparison_table_dict)
            if success:
                logger.info(f"Successfully updated audit {audit_id}.")
                updated_count += 1
            else:
                logger.error(f"Failed to update audit {audit_id}.")
        else:
            logger.info(f"Creating missing audit result for {audit_id} ({supplier_name})...")
            from app.schemas import AuditLogEntry
            audit_log = AuditLogEntry(
                audit_id=audit_id,
                supplier_id=supplier_id,
                timestamp=timestamp,
                supplier_name=supplier_name,
                workspace_title=workspace_title,
                cert_type=cert_type,
                complete_qa_data_dump="[]",
                compiled_extracted_data=json.dumps(compiled_docs),
                result=new_result,
                expiration_date=expiration_date,
                suggested_comment=new_comment,
                screenshot_url=None,
                comparison_input_tokens=0,
                comparison_output_tokens=0,
                comparison_cost_usd=0.0,
                comparison_cost_myr=0.0,
                total_run_cost_usd=sum(d.cost_usd for d in docs),
                total_run_cost_myr=sum(d.cost_myr for d in docs),
                comparison_table=comparison_table_dict
            )

            # Insert results record depending on configured DB
            success = False
            if settings.supabase_url and settings.supabase_key:
                row = [{
                    "audit_id": audit_log.audit_id,
                    "supplier_id": audit_log.supplier_id,
                    "timestamp": audit_log.timestamp,
                    "supplier_name": audit_log.supplier_name,
                    "compiled_extracted_data": audit_log.compiled_extracted_data,
                    "suggested_comments": audit_log.suggested_comment,
                    "screenshot_url": audit_log.screenshot_url,
                    "comparison_table": audit_log.comparison_table,
                    "comparison_input_tokens": audit_log.comparison_input_tokens,
                    "comparison_output_tokens": audit_log.comparison_output_tokens,
                    "comparison_cost_usd": audit_log.comparison_cost_usd,
                    "comparison_cost_myr": audit_log.comparison_cost_myr,
                    "total_run_cost_usd": audit_log.total_run_cost_usd,
                    "total_run_cost_myr": audit_log.total_run_cost_myr
                }]
                try:
                    from app.services.sheets import call_supabase_insert
                    call_supabase_insert("audit_results", row)
                    success = True
                except Exception as e:
                    logger.error(f"Failed to insert reconstructed log to Supabase: {e}")
            elif settings.google_apps_script_url:
                try:
                    from app.services.sheets import call_apps_script_post
                    success = call_apps_script_post({
                        "action": "log_audit_result",
                        "audit_id": audit_log.audit_id,
                        "supplier_id": audit_log.supplier_id,
                        "timestamp": audit_log.timestamp,
                        "supplier_name": audit_log.supplier_name,
                        "compiled_extracted_data": audit_log.compiled_extracted_data,
                        "suggested_comment": audit_log.suggested_comment,
                        "screenshot_url": audit_log.screenshot_url,
                        "comparison_table": json.dumps(audit_log.comparison_table) if audit_log.comparison_table else None,
                        "comparison_input_tokens": audit_log.comparison_input_tokens,
                        "comparison_output_tokens": audit_log.comparison_output_tokens,
                        "comparison_cost_usd": audit_log.comparison_cost_usd,
                        "comparison_cost_myr": audit_log.comparison_cost_myr,
                        "total_run_cost_usd": audit_log.total_run_cost_usd,
                        "total_run_cost_myr": audit_log.total_run_cost_myr
                    })
                except Exception as e:
                    logger.error(f"Failed to insert reconstructed log via Apps Script: {e}")
            else:
                try:
                    client = sheets.get_sheets_client()
                    result_headers = [
                        "Audit ID", "Supplier ID", "Timestamp", "Supplier Name", "Compiled Extracted Data",
                        "Suggested Comments", "Screenshot URL", "Comparison Table JSON",
                        "Comparison Input Tokens", "Comparison Output Tokens", "Comparison Cost USD", "Comparison Cost MYR",
                        "Total Run Cost USD", "Total Run Cost MYR"
                    ]
                    sheet = sheets.get_or_create_worksheet(client, "Audit_Results", result_headers)
                    row = [
                        audit_log.audit_id,
                        audit_log.supplier_id,
                        audit_log.timestamp,
                        audit_log.supplier_name,
                        audit_log.compiled_extracted_data,
                        audit_log.suggested_comment,
                        audit_log.screenshot_url,
                        json.dumps(audit_log.comparison_table) if audit_log.comparison_table else None,
                        audit_log.comparison_input_tokens,
                        audit_log.comparison_output_tokens,
                        audit_log.comparison_cost_usd,
                        audit_log.comparison_cost_myr,
                        audit_log.total_run_cost_usd,
                        audit_log.total_run_cost_myr
                    ]
                    sheet.append_row(row, table_range="A1")
                    success = True
                except Exception as e:
                    logger.error(f"Failed to insert reconstructed log to Google Sheets: {e}")

            if success:
                logger.info(f"Successfully created reconstructed audit {audit_id}.")
                created_count += 1

    logger.info(f"Reconstruction completed. Successfully updated {updated_count} and created {created_count} audit results.")

if __name__ == "__main__":
    main()
