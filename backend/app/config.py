import os
from pydantic import BaseSettings, Field

class Settings(BaseSettings):
    # Gemini Configuration
    gemini_api_key: str = Field(default="", env="GEMINI_API_KEY")

    # Google Sheets Configuration
    google_sheet_name: str = Field(default="GPO Auditor Logs Database", env="GOOGLE_SHEET_NAME")
    # Path to service account credentials JSON file
    google_creds_path: str = Field(default="credentials.json", env="GOOGLE_CREDS_PATH")
    # Optional raw JSON string for credentials (useful for CI/CD or cloud deployment env vars)
    google_creds_json: str = Field(default="", env="GOOGLE_CREDS_JSON")
    # Google Apps Script Web App Configuration (optional alternative to service accounts)
    google_apps_script_url: str = Field(default="", env="GOOGLE_APPS_SCRIPT_URL")

    # Supabase Configuration
    supabase_url: str = Field(default="", env="SUPABASE_URL")
    supabase_key: str = Field(default="", env="SUPABASE_KEY")

    # Vertex AI Configuration
    vertex_project: str = Field(default="", env="VERTEX_PROJECT")
    vertex_location: str = Field(default="us-central1", env="VERTEX_LOCATION")

    # Local Storage Configuration
    upload_dir: str = Field(default="uploads", env="UPLOAD_DIR")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()

# Ensure upload directory exists
os.makedirs(settings.upload_dir, exist_ok=True)
