"""
Legacy auditor module wrapper.
Re-exports all symbols from the modularized app.services.auditor package.
"""
from app.services.auditor.types import DocCategory, ExpiryStatus, InterceptType
from app.services.auditor.matchers import (
    _is_na,
    check_standard_equivalence,
    match_flexible,
    match_location,
    match_strict,
    match_supplier,
)
from app.services.auditor.rules import (
    check_expiry,
    check_special_rules,
    classify_document,
    parse_pl_amount,
)
from app.services.auditor.comparison_matrix import (
    build_comparison_rows,
    match_fields,
)
from app.services.auditor.comment_builder import (
    build_comment_lines,
    clean_question_label,
)
from app.services.auditor.orchestrator import (
    run_full_audit,
)

__all__ = [
    "DocCategory",
    "InterceptType",
    "ExpiryStatus",
    "match_strict",
    "match_supplier",
    "match_flexible",
    "match_location",
    "check_standard_equivalence",
    "classify_document",
    "check_expiry",
    "parse_pl_amount",
    "check_special_rules",
    "match_fields",
    "build_comparison_rows",
    "build_comment_lines",
    "clean_question_label",
    "run_full_audit",
]
