import sys
# Force python to raise ImportError when attempting to load the incompatible C-extension
sys.modules['google._upb._message'] = None

import os
# Force pure Python implementation of Protobuf to bypass Python 3.14 C-extension incompatibilities
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

"""RAG chatbot orchestration.

Pipeline: semantic cache -> hybrid retrieval -> parent fetch -> Gemini
generation -> write cache + cost log. Multi-turn aware via session history.
Supports both one-shot (``answer_query``) and SSE streaming
(``answer_query_stream``) responses.
"""

import logging
import time
from typing import Dict, List, Optional

from google import genai
from google.genai import types

from app.config import settings
from app.db.session import get_session_factory
from app.repositories.cache import CacheRepository
from app.repositories.chat import ChatMessageRepository, ChatLogRepository
from app.repositories.retrieval import hybrid_search
from app.services import embeddings
from app.services.timezones import to_malaysia

logger = logging.getLogger(__name__)

_client: Optional[genai.Client] = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


# Gemini pricing (approx, USD per 1M tokens) — adjust when the published
# gemini-3.5-flash-lite rates are confirmed.
INPUT_RATE = 0.10 / 1_000_000
OUTPUT_RATE = 0.40 / 1_000_000

SYSTEM_PROMPT = (
    "You are CQ Assistant, an internal compliance assistant for GPO.\n"
    "Answer thoroughly, accurately, and comprehensively from the provided source passages.\n"
    "- When answering questions about procedures, self-registration, or forms, list ALL step-by-step instructions, "
    "specific form fields, required fields (*), country registration examples, dropdown options, and primary contact fields "
    "extracted from the slides/documents.\n"
    "- Do not provide vague or brief summaries if the sources contain detailed form fields or UI instructions.\n"
    "- If the passages do not contain the answer, say so clearly.\n"
    "- Cite source passages using page references like [1], [2]."
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


def _split_messages(messages: List[dict]) -> tuple[Optional[str], List[dict]]:
    """Split OpenAI-style messages into Gemini system_instruction + contents."""
    system_parts = []
    contents = []
    for m in messages:
        role = m.get("role")
        content = m.get("content", "")
        if role == "system":
            system_parts.append(content)
        else:
            contents.append({
                "role": "model" if role == "assistant" else "user",
                "parts": [{"text": content}],
            })
    system = "\n".join(system_parts) if system_parts else None
    return system, contents


def _call_gemini(messages: List[dict]) -> tuple[str, int, int]:
    system, contents = _split_messages(messages)
    response = _get_client().models.generate_content(
        model=settings.gemini_chat_model,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=system,
            temperature=0.2,
        ),
    )
    content = response.text.strip()
    usage = response.usage_metadata
    in_tokens = usage.prompt_token_count if usage else 0
    out_tokens = usage.candidates_token_count if usage else 0
    return content, in_tokens, out_tokens


def _iter_gemini_stream(messages: List[dict]):
    """Stream Gemini completions.

    Yields ``(delta_text, usage_or_None)`` tuples. The final chunk carries the
    token usage when the SDK exposes it; otherwise tokens are estimated from the
    streamed text so cost accounting never hard-fails.
    """
    system, contents = _split_messages(messages)
    stream = _get_client().models.generate_content_stream(
        model=settings.gemini_chat_model,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=system,
            temperature=0.2,
        ),
    )
    parts = []
    usage = None
    for chunk in stream:
        if chunk.text:
            parts.append(chunk.text)
            yield chunk.text, None
        um = getattr(chunk, "usage_metadata", None)
        if um is not None and um.prompt_token_count is not None:
            usage = {
                "prompt_tokens": um.prompt_token_count,
                "completion_tokens": um.candidates_token_count or 0,
            }
    if usage is None and parts:
        est = max(1, sum(len(t.split()) for t in parts))
        usage = {"prompt_tokens": 0, "completion_tokens": est}
    if usage:
        yield "", usage


def _fallback_answer(results: List[dict]) -> str:
    """Grounded answer when Gemini is unavailable — quotes the top parents."""
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
        cached = await cache_repo.find_cached(
            query_embedding, threshold=0.93, ttl_days=settings.query_cache_ttl_days,
        )
        results = await hybrid_search(session, query_embedding, query, k=5)
        if cached:
            return cached.cached_response, results, None, query_embedding

    messages = None
    if settings.gemini_api_key and results:
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
    """One-shot generation: Gemini with grounded fallback.

    Returns ``(answer, in_tokens, out_tokens, cost)``.
    """
    if messages:
        try:
            answer, in_tokens, out_tokens = _call_gemini(messages)
            cost = _calculate_cost(in_tokens, out_tokens)
            return answer, in_tokens, out_tokens, cost
        except Exception as e:
            logger.warning(f"Gemini chat failed ({e}) — using grounded fallback.")
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
            "sources": _sources(results),
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
        yield {"done": True, "sources": _sources(results), "cost_usd": 0.0,
               "cache_hit": True, "session_id": session_id}
        return

    in_tokens = 0
    out_tokens = 0
    if messages:
        try:
            parts = []
            for text, usage in _iter_gemini_stream(messages):
                if usage:
                    in_tokens = int(usage.get("prompt_tokens", 0))
                    out_tokens = int(usage.get("completion_tokens", 0))
                else:
                    parts.append(text)
                    yield {"delta": text}
            answer = "".join(parts)
        except Exception as e:
            logger.warning(f"Gemini stream failed ({e}) — using grounded fallback.")
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
    return [{"role": m.role, "content": m.content, "created_at": to_malaysia(m.created_at).strftime("%d/%m/%Y, %H:%M:%S") if m.created_at else None}
            for m in msgs]
