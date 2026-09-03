"""
Legacy RAG service module wrapper.
Re-exports all symbols from the modularized app.services.rag package.
"""
from app.services.rag.interceptor import SYSTEM_PROMPT, normalize_query
from app.services.rag.citations import _reindex_citations
from app.services.rag.client import INPUT_RATE, OUTPUT_RATE
from app.services.rag.orchestrator import (
    answer_query,
    answer_query_stream,
    clear_cache,
    get_history,
    latency,
)

__all__ = [
    "SYSTEM_PROMPT",
    "INPUT_RATE",
    "OUTPUT_RATE",
    "normalize_query",
    "answer_query",
    "answer_query_stream",
    "clear_cache",
    "get_history",
    "latency",
]
