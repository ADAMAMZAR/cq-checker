# Archived Legacy Modules

This directory (`_archive`) contains the legacy internal modules of CQ-Checker that have been superseded by external tools or are paused for production:

1. **`assistant/`**: 24/7 Procurement Assistant (Chatbot) — Replaced by Google NotebookLM.
2. **`checker/`**: Certificate Auditor, Audit Registry, and Supplier Data Editor — Replaced by the Chrome Web Store extension and Power BI.
3. **`audit/`**: Supplier Audit redirect — Replaced by Power BI.
4. **`registry/`**: Audit Registry redirect — Replaced by Power BI.
5. **`editor/`**: Supplier Data Editor redirect.
6. **`matrix/`**: Comparison Matrix redirect — Accessible via Admin Console (`/admin?tab=matrix`).

> **Note**: Because this directory is prefixed with an underscore (`_archive`), Next.js App Router completely ignores it and will NOT generate public web routes or bundle these pages for production.

To restore any module in the future, simply move its folder back out of `_archive/` into `src/app/`.
