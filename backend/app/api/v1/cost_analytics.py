from fastapi import APIRouter
from app.services import audit_data_access

router = APIRouter()


@router.get("/api/costs", tags=["Cost Analytics"])
async def get_cost_analytics():
    return await audit_data_access.get_cost_analytics()
