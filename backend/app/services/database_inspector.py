"""Firestore database inspector and editor service for the Database Preview admin panel."""
import json
import logging
from typing import Any, Dict, List, Optional

from app.db.session import get_firestore_client

logger = logging.getLogger(__name__)

SUPPORTED_COLLECTIONS = ["users", "roles", "features", "auth_events"]


def parse_cell_value(val: Any) -> Any:
    """Intelligently parse string input into native types (bool, int, list, dict, null)."""
    if not isinstance(val, str):
        return val

    s = val.strip()
    if s.lower() == "true":
        return True
    if s.lower() == "false":
        return False
    if s.lower() in ("null", "none", ""):
        return None

    if (s.startswith("[") and s.endswith("]")) or (s.startswith("{") and s.endswith("}")):
        try:
            return json.loads(s)
        except Exception:
            pass

    try:
        if "." in s:
            return float(s)
        return int(s)
    except ValueError:
        pass

    return val


def format_cell_value(val: Any) -> str:
    """Format native types into string representations for grid cells."""
    if val is None:
        return ""
    if isinstance(val, bool):
        return "true" if val else "false"
    if isinstance(val, (list, dict)):
        try:
            return json.dumps(val, ensure_ascii=False)
        except Exception:
            return str(val)
    return str(val)


async def list_tables() -> List[Dict[str, Any]]:
    """Return all supported collections with their document counts."""
    db = get_firestore_client()
    result = []
    for col_name in SUPPORTED_COLLECTIONS:
        try:
            coll = db.collection(col_name)
            count_query = coll.count()
            count_res = await count_query.get()
            row_count = count_res[0][0].value
        except Exception as e:
            logger.debug(f"Could not get exact count for collection {col_name}: {e}")
            try:
                # Fallback count
                count = 0
                async for _ in db.collection(col_name).stream():
                    count += 1
                row_count = count
            except Exception:
                row_count = 0
        result.append({"name": col_name, "row_count": row_count})
    return result


async def get_full_schema() -> Dict[str, Any]:
    """Return column schemas for supported collections."""
    return {
        "users": ["id", "email", "display_name", "roles", "sso_subject", "is_active", "last_login_at", "created_at"],
        "roles": ["id", "name", "display_name", "features"],
        "features": ["id", "display_name"],
        "auth_events": ["id", "user_email", "event_type", "ip_address", "user_agent", "created_at"],
    }


async def get_table_data(
    table_name: str,
    limit: int = 100,
    offset: int = 0,
    search: Optional[str] = None,
) -> Dict[str, Any]:
    """Return paginated rows and columns for a Firestore collection."""
    db = get_firestore_client()
    coll = db.collection(table_name)

    # Standard preferred column ordering
    col_orders = {
        "users": ["id", "email", "display_name", "roles", "sso_subject", "is_active", "last_login_at", "created_at"],
        "roles": ["id", "name", "display_name", "features"],
        "features": ["id", "display_name"],
        "auth_events": ["id", "user_email", "event_type", "ip_address", "user_agent", "created_at"],
    }
    preferred_cols = col_orders.get(table_name, ["id"])

    all_docs = []
    dynamic_cols = set()

    async for doc in coll.stream():
        data = doc.to_dict() or {}
        doc_dict = {"id": doc.id, **data}
        dynamic_cols.update(doc_dict.keys())
        all_docs.append(doc_dict)

    # Ensure stable column ordering
    columns = [c for c in preferred_cols if c in dynamic_cols]
    remaining = sorted([c for c in dynamic_cols if c not in columns])
    columns.extend(remaining)
    if "id" not in columns:
        columns.insert(0, "id")

    # Format into string rows
    all_rows = []
    search_lower = search.lower().strip() if search else None

    for doc in all_docs:
        row = [format_cell_value(doc.get(c)) for c in columns]
        if search_lower:
            if not any(search_lower in cell.lower() for cell in row):
                continue
        all_rows.append(row)

    total_count = len(all_rows)
    paged_rows = all_rows[offset:offset + limit]

    return {
        "table": table_name,
        "columns": columns,
        "rows": paged_rows,
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "primary_keys": ["id"],
    }


async def delete_row(table_name: str, pk: Dict[str, Any]) -> bool:
    """Delete a document by primary key from Firestore."""
    db = get_firestore_client()
    doc_id = pk.get("id") or pk.get("email") or pk.get("name") or (list(pk.values())[0] if pk else None)
    if not doc_id:
        raise ValueError("Primary key id missing.")

    doc_ref = db.collection(table_name).document(str(doc_id))
    snap = await doc_ref.get()
    if not snap.exists:
        return False

    await doc_ref.delete()
    return True


async def update_cell(table_name: str, pk: Dict[str, Any], column: str, value: Any) -> bool:
    """Update a specific field in a Firestore document."""
    db = get_firestore_client()
    doc_id = pk.get("id") or pk.get("email") or pk.get("name") or (list(pk.values())[0] if pk else None)
    if not doc_id:
        raise ValueError("Primary key id missing.")

    doc_ref = db.collection(table_name).document(str(doc_id))
    snap = await doc_ref.get()
    if not snap.exists:
        return False

    parsed = parse_cell_value(value)
    if column == "id":
        # Cannot rename document ID directly; skip or ignore
        return False

    await doc_ref.update({column: parsed})
    return True
