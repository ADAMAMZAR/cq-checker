import os
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── Database ──────────────────────────────────────────────────
    neon_database_url: str = Field(default="", validation_alias="NEON_DATABASE_URL")

    # ── AI API Keys ───────────────────────────────────────────────
    gemini_api_key: str = Field(default="", validation_alias="GEMINI_API_KEY")
    minimax_api_key: str = Field(default="", validation_alias="MINIMAX_API_KEY")
    deepseek_api_key: str = Field(default="", validation_alias="DEEPSEEK_API_KEY")
    qwen_api_key: str = Field(default="", validation_alias="QWEN_API_KEY")

    # ── AI Providers: endpoints / models ──────────────────────────
    deepseek_base_url: str = Field(default="https://api.deepseek.com", validation_alias="DEEPSEEK_BASE_URL")
    deepseek_model: str = Field(default="deepseek-v4-flash", validation_alias="DEEPSEEK_MODEL")
    qwen_base_url: str = Field(
        default="https://dashscope.aliyuncs.com/compatible-mode/v1",
        validation_alias="QWEN_BASE_URL",
    )
    qwen_model: str = Field(default="qwen-max", validation_alias="QWEN_MODEL")
    minimax_base_url: str = Field(default="https://api.minimax.chat", validation_alias="MINIMAX_BASE_URL")
    minimax_model: str = Field(default="MiniMax-M3", validation_alias="MINIMAX_MODEL")
    gemini_embedding_model: str = Field(default="gemini-embedding-2", validation_alias="GEMINI_EMBEDDING_MODEL")
    gemini_embedding_dim: int = Field(default=1536, validation_alias="GEMINI_EMBEDDING_DIM")

    # ── Deprecated: Supabase (migration-only, remove after Phase 8) ─
    supabase_url: str = Field(default="", validation_alias="SUPABASE_URL")
    supabase_key: str = Field(default="", validation_alias="SUPABASE_KEY")

    # ── Deprecated: Vertex AI (remove after Phase 8) ─
    vertex_project: str = Field(default="", validation_alias="VERTEX_PROJECT")
    vertex_location: str = Field(default="us-central1", validation_alias="VERTEX_LOCATION")

    # ── Local Storage (dev-only, replaced by GCS in Phase 8) ─
    upload_dir: str = Field(default="uploads", validation_alias="UPLOAD_DIR")

    # ── Docling ─────────────────────────────────────────────────────────────
    # When False (default), the Docling pipeline is NOT pre-warmed at startup.
    # This avoids loading ~2 GB of layout/OCR model weights into RAM on hosts
    # that don't use Docling yet (RAG ingest still uses MiniMax/PyMuPDF).
    use_docling: bool = Field(default=False, validation_alias="USE_DOCLING")

    # ── Query cache TTL (days) ────────────────────────────────────────────────
    query_cache_ttl_days: int = Field(default=30, validation_alias="QUERY_CACHE_TTL_DAYS")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

# Ensure upload directory exists
os.makedirs(settings.upload_dir, exist_ok=True)
