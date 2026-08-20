from typing import List

from sqlalchemy import select

from app.db.session import get_session_factory
from app.models.tables import DocumentEvidence as NeonDocumentEvidence
from app.repositories.supplier_audit import SupplierRepository
from app.schemas import SupplierEntry


async def get_or_create_supplier(supplier_name: str) -> int:
    name = supplier_name.strip()
    factory = get_session_factory()
    async with factory() as session:
        repo = SupplierRepository(session)
        supplier = await repo.get_or_create(name)
        return supplier.id


async def list_suppliers() -> List[SupplierEntry]:
    factory = get_session_factory()
    async with factory() as session:
        repo = SupplierRepository(session)
        suppliers = await repo.list_all()
    return [
        SupplierEntry(
            supplier_id=s.id,
            supplier_name=s.supplier_name,
            created_at=s.created_at.strftime("%d/%m/%Y, %H:%M:%S") if getattr(s, "created_at", None) else "",
            date_added=s.created_at.strftime("%d/%m/%Y, %H:%M:%S") if getattr(s, "created_at", None) else "",
        )
        for s in suppliers
    ]


async def get_next_audit_id() -> str:
    """Return a stable sequential-style audit id."""
    factory = get_session_factory()
    async with factory() as session:
        result = await session.execute(select(NeonDocumentEvidence.audit_id))
        existing = [r[0] for r in result if r[0] and r[0].startswith("AUDIT_")]
    if existing:
        max_num = max(int(aid.replace("AUDIT_", "")) for aid in existing if aid.replace("AUDIT_", "").isdigit())
        return f"AUDIT_{max_num + 1:04d}"
    return "AUDIT_0001"
