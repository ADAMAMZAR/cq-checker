"""Async database client factory for Google Cloud Firestore."""

import logging
from typing import Optional

import google.auth
from google.auth.credentials import AnonymousCredentials
from google.cloud.firestore_v1.async_client import AsyncClient

from app.config import settings

logger = logging.getLogger(__name__)

_firestore_client: Optional[AsyncClient] = None


def get_firestore_client() -> AsyncClient:
    """Initialize or return the singleton Firestore AsyncClient."""
    global _firestore_client
    if _firestore_client is None:
        try:
            _firestore_client = AsyncClient(
                project=settings.gcp_project_id or None,
                database=settings.firestore_database if settings.firestore_database != "(default)" else "(default)",
            )
            logger.info(f"Initialized Firestore AsyncClient for project: {settings.gcp_project_id}")
        except google.auth.exceptions.DefaultCredentialsError:
            logger.warning(
                "Google Application Default Credentials (ADC) not found. "
                "Running in unauthenticated fallback mode. "
                "Run 'gcloud auth application-default login' to connect to live GCP Firestore."
            )
            _firestore_client = AsyncClient(
                project=settings.gcp_project_id or "gen-lang-client-0447597759",
                credentials=AnonymousCredentials(),
                database=settings.firestore_database if settings.firestore_database != "(default)" else "(default)",
            )
    return _firestore_client


async def get_db() -> AsyncClient:
    """FastAPI dependency yielding the Firestore AsyncClient."""
    return get_firestore_client()


async def close_firestore_client():
    """Close the Firestore client session (for graceful shutdown / tests)."""
    global _firestore_client
    if _firestore_client is not None:
        _firestore_client.close()
        _firestore_client = None
