from fastapi import APIRouter

from app.api.v1.admin_users import router as admin_users_router
from app.api.v1.ariba_audit import router as ariba_audit_router
from app.api.v1.auth import router as auth_router
from app.api.v1.certificates import router as certificates_router
from app.api.v1.chat import router as chat_router
from app.api.v1.cost_analytics import router as cost_analytics_router
from app.api.v1.database import router as database_router
from app.api.v1.documents import router as documents_router
from app.api.v1.files import router as files_router

api_v1_router = APIRouter()

api_v1_router.include_router(admin_users_router)
api_v1_router.include_router(ariba_audit_router)
api_v1_router.include_router(auth_router)
api_v1_router.include_router(certificates_router)
api_v1_router.include_router(chat_router)
api_v1_router.include_router(cost_analytics_router)
api_v1_router.include_router(database_router)
api_v1_router.include_router(documents_router)
api_v1_router.include_router(files_router)
