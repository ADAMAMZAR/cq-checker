import os
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── Database ──────────────────────────────────────────────────
    neon_database_url: str = Field(default="", validation_alias="NEON_DATABASE_URL")

    # ── AI API Keys ───────────────────────────────────────────────
    gemini_api_key: str = Field(default="", validation_alias="GEMINI_API_KEY")

    # ── AI Providers: endpoints / models ──────────────────────────
    gemini_extraction_model: str = Field(default="gemini-3.5-flash", validation_alias="GEMINI_EXTRACTION_MODEL")
    gemini_chat_model: str = Field(default="gemini-2.5-flash-lite", validation_alias="GEMINI_CHAT_MODEL")
    gemini_embedding_model: str = Field(default="gemini-embedding-2", validation_alias="GEMINI_EMBEDDING_MODEL")
    gemini_embedding_dim: int = Field(default=1536, validation_alias="GEMINI_EMBEDDING_DIM")

    ariba_client_id: str = Field(default="", validation_alias="ARIBA_CLIENT_ID")
    ariba_client_secret: str = Field(default="", validation_alias="ARIBA_CLIENT_SECRET")
    ariba_realm: str = Field(default="", validation_alias="ARIBA_REALM")
    ariba_api_key: str = Field(default="", validation_alias="ARIBA_API_KEY")
    ariba_verify_ssl: bool = Field(default=True, validation_alias="ARIBA_VERIFY_SSL")

    # ── Deprecated: Supabase (migration-only, remove after Phase 8) ─
    supabase_url: str = Field(default="", validation_alias="SUPABASE_URL")
    supabase_key: str = Field(default="", validation_alias="SUPABASE_KEY")

    # ── Deprecated: Vertex AI (remove after Phase 8) ─
    vertex_project: str = Field(default="", validation_alias="VERTEX_PROJECT")
    vertex_location: str = Field(default="us-central1", validation_alias="VERTEX_LOCATION")

    # ── Local Storage (dev-only, replaced by GCS in Phase 8) ─
    upload_dir: str = Field(default="uploads", validation_alias="UPLOAD_DIR")

    # ── Query cache TTL (days) ────────────────────────────────────────
    query_cache_ttl_days: int = Field(default=30, validation_alias="QUERY_CACHE_TTL_DAYS")

    # ── Microsoft Entra ID (SSO) ──────────────────────────────────
    entra_tenant_id: str = Field(default="", validation_alias="ENTRA_TENANT_ID")
    entra_client_id: str = Field(default="", validation_alias="ENTRA_CLIENT_ID")
    entra_client_secret: str = Field(default="", validation_alias="ENTRA_CLIENT_SECRET")
    entra_redirect_uri: str = Field(default="http://localhost:8000/auth/callback", validation_alias="ENTRA_REDIRECT_URI")
    entra_verify_ssl: bool = Field(default=False, validation_alias="ENTRA_VERIFY_SSL")

    # ── Session Management ─────────────────────────────────────────
    session_secret: str = Field(default="cq-checker-dev-session-secret-change-in-prod-1234567890", validation_alias="SESSION_SECRET")
    session_cookie_name: str = Field(default="cq_session", validation_alias="SESSION_COOKIE_NAME")
    session_max_age_seconds: int = Field(default=28800, validation_alias="SESSION_MAX_AGE_SECONDS")  # 8 hours

    # ── Role Group Mappings (Entra Group Object ID -> App Role) ────
    role_group_admin: str = Field(default="", validation_alias="ROLE_GROUP_ADMIN")
    role_group_reviewer: str = Field(default="", validation_alias="ROLE_GROUP_REVIEWER")
    role_group_auditor: str = Field(default="", validation_alias="ROLE_GROUP_AUDITOR")

    @property
    def entra_discovery_url(self) -> str:
        return f"https://login.microsoftonline.com/{self.entra_tenant_id}/v2.0/.well-known/openid-configuration"

    # ── Security & Deployment Hardening ──────────────────────────────
    environment: str = Field(default="development", validation_alias="ENVIRONMENT")
    internal_api_secret: str = Field(default="dev-internal-secret-cq-checker", validation_alias="INTERNAL_API_SECRET")
    allowed_origins: str = Field(default="http://localhost:3000", validation_alias="ALLOWED_ORIGINS")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

# Ensure upload directory exists
os.makedirs(settings.upload_dir, exist_ok=True)
