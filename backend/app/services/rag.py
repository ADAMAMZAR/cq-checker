"""RAG chatbot orchestration.

Pipeline: semantic cache -> hybrid retrieval -> parent fetch -> DeepSeek
generation -> write cache + cost log. Multi-turn aware via session history.
Supports both one-shot (``answer_query``) and SSE streaming
(``answer_query_stream``) responses.
"""

import json
import logging
import time
from typing import Dict, List, Optional

import requests

from app.config import settings
from app.db.session import get_session_factory
from app.repositories.cache import CacheRepository
from app.repositories.chat import ChatMessageRepository, ChatLogRepository
from app.repositories.retrieval import hybrid_search
from app.services import embeddings

logger = logging.getLogger(__name__)

# DeepSeek pricing (approx, USD per 1M tokens)
INPUT_RATE = 0.20 / 1_000_000
OUTPUT_RATE = 1.00 / 1_000_000

SYSTEM_PROMPT = (
    "You are CQ Assistant, an internal compliance assistant for GPO. "
    "Answer strictly from the provided source passages. If the passages do not "
    "contain the answer, say so clearly. Cite passages by their page numbers. "
    "Keep answers concise and grounded."
)


def _calculate_cost(in_tokens: int, out_tokens: int) -> float:
    return (in_tokens * INPUT_RATE) + (out_tokens * OUTPUT_RATE)


def _build_context(results: List[dict]) -> str:
    blocks = []
    for i, r in enumerate(results, 1):
        blocks.append(
            f"[{i}] (source: {r['title']}, page {r['page_number']})\n{r['parent_content']}"
        )
    return "\n\n".join(blocks)


def _sources(results: List[dict]) -> List[dict]:
    seen = set()
    out = []
    for r in results:
        key = (r["title"], r["page_number"])
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "title": r["title"],
            "page_number": r["page_number"],
            "snippet": (r["parent_content"] or "")[:300],
            "file_url": r.get("file_url"),
        })
    return out


def _call_deepseek(messages: List[dict]) -> tuple[str, int, int]:
    url = settings.deepseek_base_url.rstrip("/") + "/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.deepseek_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.deepseek_model,
        "messages": messages,
        "temperature": 0.2,
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=90)
    resp.raise_for_status()
    body = resp.json()
    content = body["choices"][0]["message"]["content"]
    usage = body.get("usage", {})
    in_tokens = int(usage.get("prompt_tokens", 0))
    out_tokens = int(usage.get("completion_tokens", 0))
    return content, in_tokens, out_tokens


def _iter_deepseek_stream(messages: List[dict]):
    """Stream DeepSeek completions.

    Yields ``(delta_text, usage_or_None)`` tuples. The final chunk carries the
    token usage when ``stream_options.include_usage`` is honoured by the API.
    """
    url = settings.deepseek_base_url.rstrip("/") + "/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.deepseek_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.deepseek_model,
        "messages": messages,
        "temperature": 0.2,
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    with requests.post(url, headers=headers, json=payload, timeout=90, stream=True) as resp:
        resp.raise_for_status()
        for raw in resp.iter_lines():
            if not raw:
                continue
            if not raw.startswith(b"data:"):
                continue
            line = raw[5:].strip()
            if not line or line == b"[DONE]":
                continue
            try:
                chunk = json.loads(line)
            except Exception:
                continue
            usage = chunk.get("usage")
            if usage:
                yield "", usage
                continue
            choices = chunk.get("choices") or []
            if choices:
                delta = choices[0].get("delta") or {}
                text = delta.get("content")
                if text:
                    yield text, None


def _fallback_answer(results: List[dict]) -> str:
    """Grounded answer when DeepSeek is unavailable — quotes the top parents."""
    if not results:
        return "No relevant manuals found for this query."
    lines = ["Here are the most relevant passages from the manuals:"]
    for i, r in enumerate(results[:3], 1):
        snippet = (r["parent_content"] or "")[:400]
        lines.append(f"[{i}] {r['title']} (page {r['page_number']}): {snippet}")
    return "\n".join(lines)


async def _prepare(query: str, session_id: Optional[str]):
    """Shared front-half: embed -> cache check -> retrieval -> build LLM messages.

    Returns ``(cached_answer_or_None, results, messages, query_embedding)``.
    """
    factory = get_session_factory()
    query_embedding = embeddings.embed_text(query)
    async with factory() as session:
        cache_repo = CacheRepository(session)
        cached = await cache_repo.find_cached(query_embedding, threshold=0.93)
        if cached:
            return cached.cached_response, [], None, query_embedding
        results = await hybrid_search(session, query_embedding, query, k=3)

    messages = None
    if settings.deepseek_api_key and results:
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        if session_id:
            messages.extend(await _load_history(factory, session_id, limit=6))
        messages.append({
            "role": "user",
            "content": f"Question: {query}\n\nRelevant passages:\n{_build_context(results)}",
        })
    return None, results, messages, query_embedding


async def _finalize(
    factory,
    query: str,
    answer: str,
    query_embedding: List[float],
    in_tokens: int,
    out_tokens: int,
    cost: float,
    cache_hit: bool,
    start: float,
    session_id: Optional[str],
) -> None:
    """Shared back-half: write cache (on miss), cost log, append history."""
    if not cache_hit:
        async with factory() as session:
            await CacheRepository(session).put(query, answer, query_embedding)
    await _log(factory, query, in_tokens, out_tokens, cost,
               cache_hit=cache_hit, latency_ms=latency(start))
    if session_id:
        await _append_history(factory, session_id, "user", query)
        await _append_history(factory, session_id, "assistant", answer)


async def _generate(messages: Optional[List[dict]], results: List[dict]) -> tuple:
    """One-shot generation: DeepSeek with grounded fallback.

    Returns ``(answer, in_tokens, out_tokens, cost)``.
    """
    if messages:
        try:
            answer, in_tokens, out_tokens = _call_deepseek(messages)
            cost = _calculate_cost(in_tokens, out_tokens)
            return answer, in_tokens, out_tokens, cost
        except Exception as e:
            logger.warning(f"DeepSeek chat failed ({e}) — using grounded fallback.")
    answer = _fallback_answer(results)
    return answer, 0, 0, 0.0


async def answer_query(query: str, session_id: Optional[str] = None) -> dict:
    """Run the full RAG pipeline. Returns a dict for ChatResponse."""
    start = time.monotonic()
    factory = get_session_factory()
    cached, results, messages, query_embedding = await _prepare(query, session_id)

    if cached is not None:
        await _finalize(factory, query, cached, query_embedding, 0, 0, 0.0,
                        cache_hit=True, start=start, session_id=session_id)
        return {
            "answer": cached,
            "sources": [],
            "cost_usd": 0.0,
            "cache_hit": True,
            "session_id": session_id,
        }

    answer, in_tokens, out_tokens, cost = await _generate(messages, results)
    await _finalize(factory, query, answer, query_embedding, in_tokens, out_tokens,
                    cost, cache_hit=False, start=start, session_id=session_id)

    return {
        "answer": answer,
        "sources": _sources(results),
        "cost_usd": round(cost, 6),
        "cache_hit": False,
        "session_id": session_id,
    }


async def answer_query_stream(query: str, session_id: Optional[str] = None):
    """Run the full RAG pipeline and yield SSE event dicts.

    Events: ``{"delta": str}`` chunks, then a final
    ``{"done": true, "sources": [...], "cost_usd": float, "cache_hit": bool,
    "session_id": str}`` event.
    """
    start = time.monotonic()
    factory = get_session_factory()
    cached, results, messages, query_embedding = await _prepare(query, session_id)

    if cached is not None:
        await _finalize(factory, query, cached, query_embedding, 0, 0, 0.0,
                        cache_hit=True, start=start, session_id=session_id)
        yield {"delta": cached}
        yield {"done": True, "sources": [], "cost_usd": 0.0,
               "cache_hit": True, "session_id": session_id}
        return

    in_tokens = 0
    out_tokens = 0
    if messages:
        try:
            parts = []
            for text, usage in _iter_deepseek_stream(messages):
                if usage:
                    in_tokens = int(usage.get("prompt_tokens", 0))
                    out_tokens = int(usage.get("completion_tokens", 0))
                else:
                    parts.append(text)
                    yield {"delta": text}
            answer = "".join(parts)
        except Exception as e:
            logger.warning(f"DeepSeek stream failed ({e}) — using grounded fallback.")
            answer = _fallback_answer(results)
            yield {"delta": answer}
    else:
        answer = _fallback_answer(results)
        yield {"delta": answer}

    cost = _calculate_cost(in_tokens, out_tokens)
    await _finalize(factory, query, answer, query_embedding, in_tokens, out_tokens,
                    cost, cache_hit=False, start=start, session_id=session_id)
    yield {"done": True, "sources": _sources(results), "cost_usd": round(cost, 6),
           "cache_hit": False, "session_id": session_id}


# ── helpers ──────────────────────────────────────────────────────────────────

def latency(start: float) -> int:
    return int((time.monotonic() - start) * 1000)


async def _append_history(factory, session_id: str, role: str, content: str) -> None:
    async with factory() as session:
        await ChatMessageRepository(session).add(session_id, role, content)


async def _load_history(factory, session_id: str, limit: int = 6) -> List[dict]:
    async with factory() as session:
        msgs = await ChatMessageRepository(session).recent(session_id, limit=limit)
    return [{"role": m.role, "content": m.content} for m in msgs]


async def _log(factory, query: str, in_t: int, out_t: int, cost: float,
               cache_hit: bool, latency_ms: int) -> None:
    try:
        async with factory() as session:
            await ChatLogRepository(session).add(
                query, in_t, out_t, cost, cache_hit=cache_hit, latency_ms=latency_ms,
            )
    except Exception as e:
        logger.error(f"Failed to write chat log: {e}")


async def clear_cache() -> int:
    factory = get_session_factory()
    async with factory() as session:
        return await CacheRepository(session).clear_all()


async def get_history(session_id: str) -> List[dict]:
    factory = get_session_factory()
    async with factory() as session:
        msgs = await ChatMessageRepository(session).recent(session_id, limit=50)
    return [{"role": m.role, "content": m.content, "created_at": m.created_at.isoformat() if m.created_at else None}
            for m in msgs]
