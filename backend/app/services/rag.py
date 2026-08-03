"""RAG chatbot orchestration.

Pipeline: semantic cache -> hybrid retrieval -> parent fetch -> DeepSeek
generation -> write cache + cost log. Multi-turn aware via session history.
"""

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


def _fallback_answer(results: List[dict]) -> str:
    """Grounded answer when DeepSeek is unavailable — quotes the top parents."""
    if not results:
        return "No relevant manuals found for this query."
    lines = ["Here are the most relevant passages from the manuals:"]
    for i, r in enumerate(results[:3], 1):
        snippet = (r["parent_content"] or "")[:400]
        lines.append(f"[{i}] {r['title']} (page {r['page_number']}): {snippet}")
    return "\n".join(lines)


async def answer_query(query: str, session_id: Optional[str] = None) -> dict:
    """Run the full RAG pipeline. Returns a dict for ChatResponse."""
    start = time.monotonic()
    cache_hit = False
    in_tokens = 0
    out_tokens = 0
    cost = 0.0

    query_embedding = embeddings.embed_text(query)

    factory = get_session_factory()
    async with factory() as session:
        cache_repo = CacheRepository(session)

        # 1. Semantic cache
        cached = await cache_repo.find_cached(query_embedding, threshold=0.93)
        if cached:
            answer = cached.cached_response
            cache_hit = True
            await _log(factory, query, 0, 0, 0.0, cache_hit=True, latency_ms=latency(start))
            if session_id:
                await _append_history(factory, session_id, "user", query)
                await _append_history(factory, session_id, "assistant", answer)
            return {
                "answer": answer,
                "sources": [],
                "cost_usd": 0.0,
                "cache_hit": True,
                "session_id": session_id,
            }

        # 2. Hybrid retrieval (top-3)
        results = await hybrid_search(session, query_embedding, query, k=3)

        # 3. Generation
        if settings.deepseek_api_key and results:
            context = _build_context(results)
            messages = [{"role": "system", "content": SYSTEM_PROMPT}]
            if session_id:
                history = await _load_history(factory, session_id, limit=6)
                messages.extend(history)
            messages.append({
                "role": "user",
                "content": f"Question: {query}\n\nRelevant passages:\n{context}",
            })
            try:
                answer, in_tokens, out_tokens = _call_deepseek(messages)
                cost = _calculate_cost(in_tokens, out_tokens)
            except Exception as e:
                logger.warning(f"DeepSeek chat failed ({e}) — using grounded fallback.")
                answer = _fallback_answer(results)
        else:
            answer = _fallback_answer(results)

        # 4. Write cache + cost log
        await cache_repo.put(query, answer, query_embedding)
        await _log(factory, query, in_tokens, out_tokens, cost,
                   cache_hit=False, latency_ms=latency(start))

        if session_id:
            await _append_history(factory, session_id, "user", query)
            await _append_history(factory, session_id, "assistant", answer)

    return {
        "answer": answer,
        "sources": _sources(results),
        "cost_usd": round(cost, 6),
        "cache_hit": False,
        "session_id": session_id,
    }


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
