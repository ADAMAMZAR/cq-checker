from fastapi import APIRouter

from app.api.v1.admin_users import router as admin_users_router
from app.api.v1.auth import router as auth_router
from app.api.v1.database import router as database_router

api_v1_router = APIRouter()

api_v1_router.include_router(admin_users_router)
api_v1_router.include_router(auth_router)
api_v1_router.include_router(database_router)