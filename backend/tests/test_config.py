import os
import pytest

# Ensure backend root is in sys.path
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Force pure Python protobuf before importing config
sys.modules['google._upb._message'] = None
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"


class TestSettingsDefaults:
    """Verify Settings loads with empty/missing env vars (dev defaults)."""

    def _fresh_settings(self, monkeypatch):
        """Create a Settings instance that reads ONLY from env vars, not .env file."""
        for key in [
            "NEON_DATABASE_URL", "GEMINI_API_KEY", "MINIMAX_API_KEY",
            "DEEPSEEK_API_KEY", "QWEN_API_KEY", "UPLOAD_DIR",
            "SUPABASE_URL", "SUPABASE_KEY", "VERTEX_PROJECT", "VERTEX_LOCATION",
        ]:
            monkeypatch.delenv(key, raising=False)
        from app.config import Settings

        class TestSettings(Settings):
            class Config:
                env_file = None  # Skip .env file — read only from env vars
                env_file_encoding = "utf-8"
                extra = "ignore"

        return TestSettings()

    def test_neon_database_url_default(self, monkeypatch):
        s = self._fresh_settings(monkeypatch)
        assert s.neon_database_url == ""

    def test_ai_keys_default_empty(self, monkeypatch):
        s = self._fresh_settings(monkeypatch)
        assert s.gemini_api_key == ""
        assert s.minimax_api_key == ""
        assert s.deepseek_api_key == ""
        assert s.qwen_api_key == ""

    def test_deprecated_fields_present(self, monkeypatch):
        """Deprecated Supabase fields still exist for migration."""
        s = self._fresh_settings(monkeypatch)
        assert hasattr(s, "supabase_url")
        assert hasattr(s, "supabase_key")
        assert hasattr(s, "vertex_project")
        assert hasattr(s, "vertex_location")

    def test_upload_dir_default(self, monkeypatch):
        s = self._fresh_settings(monkeypatch)
        assert s.upload_dir == "uploads"


class TestSettingsFromEnv:
    """Verify Settings reads values from environment variables."""

    def test_neon_database_url_from_env(self, monkeypatch):
        monkeypatch.setenv("NEON_DATABASE_URL", "postgresql+asyncpg://user:pass@host:5432/db")
        from app.config import Settings
        s = Settings()
        assert s.neon_database_url == "postgresql+asyncpg://user:pass@host:5432/db"

    def test_ai_keys_from_env(self, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "gemini-123")
        monkeypatch.setenv("MINIMAX_API_KEY", "minimax-456")
        monkeypatch.setenv("DEEPSEEK_API_KEY", "deepseek-789")
        monkeypatch.setenv("QWEN_API_KEY", "qwen-abc")
        from app.config import Settings
        s = Settings()
        assert s.gemini_api_key == "gemini-123"
        assert s.minimax_api_key == "minimax-456"
        assert s.deepseek_api_key == "deepseek-789"
        assert s.qwen_api_key == "qwen-abc"

    def test_upload_dir_from_env(self, monkeypatch):
        monkeypatch.setenv("UPLOAD_DIR", "/tmp/test-uploads")
        from app.config import Settings
        s = Settings()
        assert s.upload_dir == "/tmp/test-uploads"
