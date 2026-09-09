import pytest
from app.db.session import get_firestore_client, close_firestore_client
from app.config import settings


@pytest.mark.asyncio
async def test_firestore_client_initialization():
    """Verify that Firestore AsyncClient initializes with configured GCP project."""
    await close_firestore_client()
    client = get_firestore_client()
    assert client is not None
    assert client.project == (settings.gcp_project_id or "gen-lang-client-0447597759")

    # Verify singleton
    client2 = get_firestore_client()
    assert client is client2

    await close_firestore_client()
