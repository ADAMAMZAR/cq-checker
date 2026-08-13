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

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

# Ensure upload directory exists
os.makedirs(settings.upload_dir, exist_ok=True)
