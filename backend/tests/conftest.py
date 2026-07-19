import sys
import os
import pytest

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Ensure sys.modules compatibility overlays are loaded first
sys.modules['google._upb._message'] = None
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

from app.config import settings

@pytest.fixture(autouse=True)
def disable_apps_script_url_for_tests():
    """
    Force google_apps_script_url and supabase credentials to be empty during unit tests,
    ensuring they use the mock sheets client instead of attempting HTTP/REST requests.
    """
    original_url = settings.google_apps_script_url
    original_sb_url = settings.supabase_url
    original_sb_key = settings.supabase_key
    
    settings.google_apps_script_url = ""
    settings.supabase_url = ""
    settings.supabase_key = ""
    yield
    settings.google_apps_script_url = original_url
    settings.supabase_url = original_sb_url
    settings.supabase_key = original_sb_key
