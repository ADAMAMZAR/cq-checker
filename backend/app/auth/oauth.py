"""Authlib OAuth client configured for Microsoft Entra ID."""
from authlib.integrations.starlette_client import OAuth
from app.config import settings

oauth = OAuth()

if settings.entra_tenant_id and settings.entra_client_id:
    client_kwargs = {
        "scope": "openid email profile",
        "verify": settings.entra_verify_ssl,
    }
    oauth.register(
        name="entra",
        server_metadata_url=settings.entra_discovery_url,
        client_id=settings.entra_client_id,
        client_secret=settings.entra_client_secret,
        client_kwargs=client_kwargs,
    )
