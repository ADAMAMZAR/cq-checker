import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    # Gemini Configuration
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")

    # Google Sheets Configuration
    google_sheet_name: str = Field(default="GPO Auditor Logs Database", alias="GOOGLE_SHEET_NAME")
    # Path to service account credentials JSON file
    google_creds_path: str = Field(default="credentials.json", alias="GOOGLE_CREDS_PATH")
    # Optional raw JSON string for credentials (useful for CI/CD or cloud deployment env vars)
    google_creds_json: str = Field(default="", alias="GOOGLE_CREDS_JSON")

    # Local Storage Configuration
    upload_dir: str = Field(default="uploads", alias="UPLOAD_DIR")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

# Ensure upload directory exists
os.makedirs(settings.upload_dir, exist_ok=True)
