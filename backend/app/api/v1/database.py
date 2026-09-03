import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy.exc import IntegrityError

from app.services import database_inspector

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Read-only & Editor Database Grid Browser ──────────────────────────────────


@router.get("/api/db/tables", tags=["Database Browser"])
@router.get("/api/db/tables/", tags=["Database Browser"])
async def db_list_tables():
    return await database_inspector.list_tables()


@router.get("/api/db/schema", tags=["Database Browser"])
@router.get("/api/db/schema/", tags=["Database Browser"])
async def db_get_schema():
    return await database_inspector.get_full_schema()


@router.get("/api/db/tables/{table_name}", tags=["Database Browser"])
@router.get("/api/db/tables/{table_name}/", tags=["Database Browser"])
async def db_get_table(table_name: str, limit: int = 100, offset: int = 0, q: Optional[str] = Query(None)):
    valid = await database_inspector.list_tables()
    names = {t["name"] for t in valid}
    if table_name not in names:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found.")
    return await database_inspector.get_table_data(table_name, limit=limit, offset=offset, search=q)


@router.delete("/api/db/tables/{table_name}", tags=["Database Browser"])
async def db_delete_row(table_name: str, payload: dict):
    valid = await database_inspector.list_tables()
    names = {t["name"] for t in valid}
    if table_name not in names:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found.")

    pk = (payload or {}).get("pk")
    if not isinstance(pk, dict) or not pk:
        raise HTTPException(status_code=400, detail="Body must include an object 'pk' with primary key values.")

    try:
        deleted = await database_inspector.delete_row(table_name, pk)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except IntegrityError as e:
        logger.error(f"DB delete FK violation on {table_name}: {e}")
        raise HTTPException(
            status_code=400,
            detail="Cannot delete this row — it is referenced by other records (foreign key). Delete those first.",
        )

    if not deleted:
        raise HTTPException(status_code=404, detail="Row not found.")
    return {"deleted": deleted}


@router.put("/api/db/tables/{table_name}", tags=["Database Browser"])
async def db_update_row(table_name: str, payload: dict):
    valid = await database_inspector.list_tables()
    names = {t["name"] for t in valid}
    if table_name not in names:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found.")

    pk = (payload or {}).get("pk")
    column = (payload or {}).get("column")
    value = (payload or {}).get("value")

    if not isinstance(pk, dict) or not pk:
        raise HTTPException(status_code=400, detail="Body must include an object 'pk' with primary key values.")
    if not column or not isinstance(column, str):
        raise HTTPException(status_code=400, detail="Body must include a string 'column'.")

    try:
        updated = await database_inspector.update_cell(table_name, pk, column, value)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not updated:
        raise HTTPException(status_code=404, detail="Row not found or no changes made.")
    return {"updated": updated}
