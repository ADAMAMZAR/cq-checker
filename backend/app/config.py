import os
from pydantic import BaseSettings, Field


class Settings(BaseSettings):
    # ── Database ──────────────────────────────────────────────────
    neon_database_url: str = Field(default="", env="NEON_DATABASE_URL")

    # ── AI API Keys ───────────────────────────────────────────────
    gemini_api_key: str = Field(default="", env="GEMINI_API_KEY")
    minimax_api_key: str = Field(default="", env="MINIMAX_API_KEY")
    deepseek_api_key: str = Field(default="", env="DEEPSEEK_API_KEY")
    qwen_api_key: str = Field(default="", env="QWEN_API_KEY")

    # ── Deprecated: Supabase (migration-only, remove after Phase 8) ─
    supabase_url: str = Field(default="", env="SUPABASE_URL")
    supabase_key: str = Field(default="", env="SUPABASE_KEY")

    # ── Deprecated: Vertex AI (remove after Phase 8) ─
    vertex_project: str = Field(default="", env="VERTEX_PROJECT")
    vertex_location: str = Field(default="us-central1", env="VERTEX_LOCATION")

    # ── Local Storage (dev-only, replaced by GCS in Phase 8) ─
    upload_dir: str = Field(default="uploads", env="UPLOAD_DIR")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()

# Ensure upload directory exists
os.makedirs(settings.upload_dir, exist_ok=True)
