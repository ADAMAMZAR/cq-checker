import sys
# Force python to raise ImportError when attempting to load the incompatible C-extension
sys.modules['google._upb._message'] = None

import os
# Force pure Python implementation of Protobuf to bypass Python 3.14 C-extension incompatibilities
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_v1_router
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


app = FastAPI(
    title="GPO Automatic Certificate Auditor API",
    description="Backend API for auditing certificates and logging results to Neon PostgreSQL",
    version="1.0.0",
    openapi_tags=API_TAGS,
    lifespan=lifespan,
)

# Configure CORS so the Chrome Extension and Next.js can connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
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
