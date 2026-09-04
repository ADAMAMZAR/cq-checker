import sys
# Force python to raise ImportError when attempting to load the incompatible C-extension
sys.modules['google._upb._message'] = None

import os
# Force pure Python implementation of Protobuf to bypass Python 3.14 C-extension incompatibilities
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_read_root():
    """Verify system health check endpoint."""
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
