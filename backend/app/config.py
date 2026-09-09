from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── Database (Firebase Firestore) ─────────────────────────────
    gcp_project_id: str = Field(default="gen-lang-client-0447597759", validation_alias="GCP_PROJECT_ID")
    firestore_database: str = Field(default="(default)", validation_alias="FIRESTORE_DATABASE")

    # ── Microsoft Entra ID (SSO) ──────────────────────────────────
    entra_tenant_id: str = Field(default="", validation_alias="ENTRA_TENANT_ID")
    entra_client_id: str = Field(default="", validation_alias="ENTRA_CLIENT_ID")
    entra_client_secret: str = Field(default="", validation_alias="ENTRA_CLIENT_SECRET")
    entra_redirect_uri: str = Field(default="http://localhost:8000/auth/callback", validation_alias="ENTRA_REDIRECT_URI")
    entra_verify_ssl: bool = Field(default=False, validation_alias="ENTRA_VERIFY_SSL")

    # ── Session Management ─────────────────────────────────────────
    session_secret: str = Field(default="cq-checker-dev-session-secret-change-in-prod-1234567890", validation_alias="SESSION_SECRET")
    session_cookie_name: str = Field(default="__session", validation_alias="SESSION_COOKIE_NAME")
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
