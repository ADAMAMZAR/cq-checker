"""Tests for Gemini Embedding 2 (REST) with pseudo-embedding fallback."""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.modules['google._upb._message'] = None
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

from unittest.mock import MagicMock, patch
from app.services import embeddings


def test_pseudo_embedding_dim_and_deterministic():
    a = embeddings.pseudo_embedding("hello", dim=1536)
    b = embeddings.pseudo_embedding("hello", dim=1536)
    c = embeddings.pseudo_embedding("world", dim=1536)
    assert len(a) == 1536
    assert a == b
    assert a != c
    assert all(-1.0 <= v <= 1.0 for v in a)


def test_embed_texts_fallback_without_key():
    with patch("app.config.settings.gemini_api_key", ""):
        vecs = embeddings.embed_texts(["one", "two"])
    assert len(vecs) == 2
    assert len(vecs[0]) == 1536


def test_embed_texts_calls_gemini_rest():
    mock_resp = MagicMock()
    mock_resp.raise_for_status.return_value = None
    mock_resp.json.return_value = {
        "embeddings": [
            {"values": [0.1] * 1536},
            {"values": [0.2] * 1536},
        ]
    }
    with patch("app.config.settings.gemini_api_key", "g-test"):
        with patch("requests.post", return_value=mock_resp) as mock_post:
            vecs = embeddings.embed_texts(["a", "b"])
    assert len(vecs) == 2
    assert len(vecs[0]) == 1536
    mock_post.assert_called_once()


def test_embed_texts_empty():
    assert embeddings.embed_texts([]) == []
