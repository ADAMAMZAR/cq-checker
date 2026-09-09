import os
import sys

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Force pure Python protobuf before importing config
sys.modules['google._upb._message'] = None
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"


class TestSettingsDefaults:
    def _fresh_settings(self, monkeypatch):
        """Create a Settings instance that reads ONLY from env vars, not .env file."""
        keys_to_clear = [
            "GCP_PROJECT_ID",
            "FIRESTORE_DATABASE",
            "ENTRA_TENANT_ID",
            "ENTRA_CLIENT_ID",
            "ENTRA_CLIENT_SECRET",
            "ENTRA_REDIRECT_URI",
            "SESSION_SECRET",
            "ALLOWED_ORIGINS",
        ]
        for key in keys_to_clear:
            monkeypatch.delenv(key, raising=False)
        from app.config import Settings
        from pydantic_settings import SettingsConfigDict

        class TestSettings(Settings):
            model_config = SettingsConfigDict(
                env_file=None,  # Skip .env file — read only from env vars
                env_file_encoding="utf-8",
                extra="ignore",
            )

        return TestSettings()

    def test_firestore_settings_default(self, monkeypatch):
        s = self._fresh_settings(monkeypatch)
        assert s.gcp_project_id == "gen-lang-client-0447597759"
        assert s.firestore_database == "(default)"

    def test_entra_settings_default(self, monkeypatch):
        s = self._fresh_settings(monkeypatch)
        assert s.entra_tenant_id == ""
        assert s.entra_client_id == ""
        assert s.entra_client_secret == ""


class TestSettingsFromEnv:
    """Verify Settings reads values from environment variables."""

    def test_firestore_settings_from_env(self, monkeypatch):
        monkeypatch.setenv("GCP_PROJECT_ID", "custom-gcp-project")
        monkeypatch.setenv("FIRESTORE_DATABASE", "custom-db")
        from app.config import Settings
        s = Settings()
        assert s.gcp_project_id == "custom-gcp-project"
        assert s.firestore_database == "custom-db"

    def test_entra_settings_from_env(self, monkeypatch):
        monkeypatch.setenv("ENTRA_TENANT_ID", "test-tenant-123")
        from app.config import Settings
        s = Settings()
        assert s.entra_tenant_id == "test-tenant-123"
