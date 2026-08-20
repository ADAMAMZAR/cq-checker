import sys
# Force python to raise ImportError when attempting to load the incompatible C-extension
sys.modules['google._upb._message'] = None

import os
# Force pure Python implementation of Protobuf to bypass Python 3.14 C-extension incompatibilities
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_v1_router
from app.config import settings
from app.db.init_db import init_db_tables

logger = logging.getLogger(__name__)

API_TAGS = [
    {"name": "System / Health", "description": "Service health check."},
    {"name": "Supplier Audit — Full Run & Comparison", "description": "Gemini extraction — full audit run and comparison phase."},
    {"name": "Supplier Audit — Single Phase Waterfall", "description": "Live SAP Ariba supplier fetching, questionnaires & attachment download."},
    {"name": "Supplier Audit — Read / Update", "description": "Legacy audit logs, registry, evidence, and supplier assets."},
    {"name": "Cost Analytics", "description": "Aggregated cost/usage analytics across audits."},
    {"name": "Certificate Verification", "description": "Phase 4 — Gemini extraction + deterministic rules pipeline."},
    {"name": "Document Ingestion / RAG", "description": "Phase 5 — manual ingestion: parse, chunk, embed, store."},
    {"name": "RAG Chatbot", "description": "Phase 6 — semantic cache + hybrid retrieval + Gemini generation."},
    {"name": "File Serving", "description": "Serve uploaded files (local disk and legacy Supabase proxy)."},
    {"name": "Database Browser", "description": "Read-only and editing database grid browser."},
    {"name": "Auth & RBAC", "description": "Role-based access control and system permissions."},
]


@asynccontextmanager
async def lifespan(app_instance: FastAPI):
    try:
        await init_db_tables()
    except Exception as e:
        logger.error(f"Failed to initialize database tables: {e}")
    yield


is_prod = settings.environment.lower() == "production"

app = FastAPI(
    title="GPO Automatic Certificate Auditor API",
    description="Backend API for auditing certificates and logging results to Neon PostgreSQL",
    version="1.0.0",
    openapi_tags=API_TAGS,
    lifespan=lifespan,
    docs_url=None if is_prod else "/docs",
    redoc_url=None if is_prod else "/redoc",
    openapi_url=None if is_prod else "/openapi.json",
)


ALLOWED_DOMAIN = "gamuda.com.my"


# Security Middleware: Verify pre-shared internal secret token header & company domain gate before SSO implementation
@app.middleware("http")
async def verify_internal_secret_header(request: Request, call_next):
    # Allow OPTIONS preflight requests and public health/docs endpoints
    bypassed_paths = {"/", "/docs", "/redoc", "/openapi.json"}
    if request.method == "OPTIONS" or request.url.path in bypassed_paths:
        return await call_next(request)

    # 1. Layer 1: Secret Key Verification
    expected_secret = settings.internal_api_secret.strip()
    client_secret = request.headers.get("X-Internal-Secret", "").strip()

    if expected_secret and client_secret != expected_secret:
        logger.warning(f"Unauthorized access attempt to {request.url.path} from {request.client.host if request.client else 'unknown'}")
        return JSONResponse(
            status_code=401,
            content={"detail": "Unauthorized access. Missing or invalid internal secret header."},
        )

    # 2. Layer 2: Gamuda Corporate Domain Gate
    user_email = request.headers.get("X-User-Email", "").strip().lower()
    if not user_email or not user_email.endswith(f"@{ALLOWED_DOMAIN}"):
        logger.warning(f"Domain access denied for '{user_email or 'Unauthenticated'}' accessing {request.url.path}")
        return JSONResponse(
            status_code=403,
            content={
                "detail": f"Access Denied: Only Gamudian are allowed to access this system.",
                "provided_email": user_email or "None",
            },
        )

    return await call_next(request)


# Configure CORS strictly for trusted web origins
raw_origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
cors_origins = raw_origins if raw_origins else ["http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount master API v1 router
app.include_router(api_v1_router)


@app.get("/", tags=["System / Health"])
async def root_health_check():
    """Health check endpoint confirming API service status."""
    return {
        "status": "healthy",
        "service": "GPO Automatic Certificate Auditor API",
        "version": "1.0.0",
    }
