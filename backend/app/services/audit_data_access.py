"""
Legacy audit_data_access service module wrapper.
Re-exports all symbols from the modularized app.services.audit_data package.
"""
from app.services.audit_data.serializers import (
    MYR_RATE,
    _display_timestamp,
    _to_audit_log_entry,
    _to_db_timestamp,
    _to_document_evidence,
)
from app.services.audit_data.suppliers import (
    get_next_audit_id,
    get_or_create_supplier,
    list_suppliers,
)
from app.services.audit_data.audit_logs import (
    get_audit_logs,
    get_audit_registry,
    get_audit_registry_detail,
    log_audit_run,
    update_audit_result,
)
from app.services.audit_data.evidence import (
    find_metadata_by_hash,
    get_document_evidence_by_id,
    get_document_evidence_logs,
    get_document_evidence_summary,
    get_evidence_urls_by_supplier_id,
    get_screenshot_urls_by_supplier_id,
    update_document_evidence,
)
from app.services.audit_data.analytics import (
    get_cost_analytics,
)

__all__ = [
    "MYR_RATE",
    "_to_db_timestamp",
    "_display_timestamp",
    "_to_audit_log_entry",
    "_to_document_evidence",
    "get_or_create_supplier",
    "list_suppliers",
    "get_next_audit_id",
    "get_audit_logs",
    "get_audit_registry",
    "get_audit_registry_detail",
    "update_audit_result",
    "log_audit_run",
    "get_document_evidence_summary",
    "get_document_evidence_by_id",
    "get_document_evidence_logs",
    "update_document_evidence",
    "find_metadata_by_hash",
    "get_evidence_urls_by_supplier_id",
    "get_screenshot_urls_by_supplier_id",
    "get_cost_analytics",
]
