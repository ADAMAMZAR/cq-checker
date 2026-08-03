"""Gemini Embedding 2 via direct REST.

Bypasses the google-generativeai SDK (broken on Python 3.14). Uses Matryoshka
output_dimensionality=1536. Falls back to a deterministic pseudo-embedding when
no API key is configured (dev/test only — clearly marked).
"""

import hashlib
import logging
from typing import List

import requests

from app.config import settings

logger = logging.getLogger(__name__)

BATCH_SIZE = 32
EMBEDDING_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents"


def pseudo_embedding(text: str, dim: int = 1536) -> List[float]:
    """Deterministic hash-based vector. NOT a real semantic embedding.

    Used only when GEMINI_API_KEY is absent, so tests/dev can run offline.
    """
    vector = []
    for i in range(dim):
        h = hashlib.sha256(f"{text}::{i}".encode("utf-8")).hexdigest()
        val = (int(h[:8], 16) / 0xFFFFFFFF) * 2.0 - 1.0
        vector.append(round(val, 6))
    return vector


def _call_gemini_embedding(texts: List[str]) -> List[List[float]]:
    model = settings.gemini_embedding_model
    dim = settings.gemini_embedding_dim
    url = EMBEDDING_ENDPOINT.format(model=model) + f"?key={settings.gemini_api_key}"

    payload = {
        "requests": [
            {
                "model": f"models/{model}",
                "content": {"parts": [{"text": t}]},
                "outputDimensionality": dim,
            }
            for t in texts
        ]
    }
    resp = requests.post(url, json=payload, timeout=60)
    resp.raise_for_status()
    body = resp.json()

    embeddings = []
    for item in body.get("embeddings", []):
        values = item.get("values", [])
        embeddings.append([float(v) for v in values])
    return embeddings


def embed_texts(texts: List[str]) -> List[List[float]]:
    """Embed a list of texts. Returns a list of 1536-dim vectors."""
    if not texts:
        return []

    if not settings.gemini_api_key:
        logger.warning("GEMINI_API_KEY not set — using pseudo-embeddings (dev/test only).")
        return [pseudo_embedding(t, settings.gemini_embedding_dim) for t in texts]

    results: List[List[float]] = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i:i + BATCH_SIZE]
        try:
            results.extend(_call_gemini_embedding(batch))
        except Exception as e:
            logger.error(f"Gemini embedding failed ({e}) — falling back to pseudo-embeddings.")
            results.extend([pseudo_embedding(t, settings.gemini_embedding_dim) for t in batch])
    return results


def embed_text(text: str) -> List[float]:
    vecs = embed_texts([text])
    return vecs[0] if vecs else []
