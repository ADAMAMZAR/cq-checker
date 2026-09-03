import logging
import time
from typing import List, Optional, Tuple

from app.config import settings
from app.db.session import get_session_factory
from app.repositories.cache import CacheRepository
from app.repositories.chat import ChatLogRepository, ChatMessageRepository
from app.repositories.retrieval import hybrid_search
from app.services import embeddings
from app.services.region_router import classify_query_intent
from app.services.timezones import to_malaysia
from app.services.rag.interceptor import SYSTEM_PROMPT, _check_fast_rule_interceptor, normalize_query
from app.services.rag.citations import _build_context, _reindex_citations
from app.services.rag.client import (
    _calculate_cost,
    _call_gemini,
    _fallback_answer,
    _iter_gemini_stream,
)

logger = logging.getLogger(__name__)


def latency(start: float) -> int:
    return int((time.monotonic() - start) * 1000)


async def _append_history(factory, session_id: str, role: str, content: str, sources: Optional[List[dict]] = None):
    async with factory() as session:
        return await ChatMessageRepository(session).add(session_id, role, content, sources=sources)


async def _load_history(factory, session_id: str, limit: int = 6) -> List[dict]:
    async with factory() as session:
        msgs = await ChatMessageRepository(session).recent(session_id, limit=limit)
    return [{"role": m.role, "content": m.content} for m in msgs]


async def _log(
    factory,
    query: str,
    in_t: int,
    out_t: int,
    cost: float,
    cache_hit: bool,
    latency_ms: int,
    cached_query_id=None,
    cached_query_text=None,
) -> None:
    try:
        async with factory() as session:
            await ChatLogRepository(session).add(
                query, in_t, out_t, cost, cache_hit=cache_hit, latency_ms=latency_ms,
                cached_query_id=cached_query_id, cached_query_text=cached_query_text,
            )
    except Exception as e:
        logger.error(f"Failed to write chat log: {e}")


async def _prepare(query: str, session_id: Optional[str]):
    """Shared front-half: fast interceptor -> embed -> cache check -> retrieval -> build LLM messages."""
    intercepted = _check_fast_rule_interceptor(query)
    if intercepted:
        return {
            "response": intercepted["answer"],
            "id": None,
            "query_text": query,
        }, [], None, []

    factory = get_session_factory()
    norm_query = normalize_query(query)
    query_embedding = embeddings.embed_text(norm_query)

    intent = classify_query_intent(query)

    async with factory() as session:
        cache_repo = CacheRepository(session)
        cached = await cache_repo.find_cached(
            query_embedding, threshold=0.93, ttl_days=settings.query_cache_ttl_days,
        )
        results = await hybrid_search(
            session, query_embedding, query, k=3, window_size=5,
            target_regions=intent["target_regions"],
        )
        result_summary = [(r['title'], f"pages {r.get('page_number_start')}-{r.get('page_number_end')}", r.get('region', 'GENERAL')) for r in results]
        logger.info(f"RAG retrieved {len(results)} windowed passages for '{query}' (Region Intent: {intent['detected_region']}): {result_summary}")
        for idx, r in enumerate(results):
            logger.info(f"Passage {idx+1} ({r['title']} p.{r['page_number']} [{r.get('region', 'GENERAL')}]): {(r.get('parent_content') or '')[:150]}")
        if cached:
            return {
                "response": cached.cached_response,
                "id": cached.id,
                "query_text": cached.query_text,
            }, results, None, query_embedding

    messages = None
    if settings.gemini_api_key and results:
        system_content = SYSTEM_PROMPT + (
            f"\n\n[ROUTING DIRECTIVE]: Target Region = '{intent['detected_region']}'. "
            f"Mandatory Output Language = '{intent['output_lang_name']}'. "
            f"If query is in English, reply in English prioritizing {intent['detected_region']} guidelines."
        )
        messages = [{"role": "system", "content": system_content}]
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
    cached_query_id=None,
    cached_query_text=None,
    sources: Optional[List[dict]] = None,
):
    """Shared back-half: write cache (on miss), cost log, append history. Returns assistant message ID."""
    if not cache_hit and query_embedding:
        async with factory() as session:
            await CacheRepository(session).put(query, answer, query_embedding)
    await _log(factory, query, in_tokens, out_tokens, cost,
               cache_hit=cache_hit, latency_ms=latency(start),
               cached_query_id=cached_query_id, cached_query_text=cached_query_text)
    assistant_msg_id = None
    if session_id:
        await _append_history(factory, session_id, "user", query)
        assistant_msg = await _append_history(factory, session_id, "assistant", answer, sources=sources)
        assistant_msg_id = str(assistant_msg.id) if assistant_msg else None
    return assistant_msg_id


async def _generate(messages: Optional[List[dict]], results: List[dict]) -> tuple:
    if messages:
        try:
            answer, in_tokens, out_tokens = _call_gemini(messages)
            cost = _calculate_cost(in_tokens, out_tokens)
            return answer, in_tokens, out_tokens, cost
        except Exception as e:
            logger.warning(f"Gemini chat failed ({e}) — using grounded fallback.")
    answer = _fallback_answer(results)
    return answer, 0, 0, 0.0


def _build_debug_tracing(results: List[dict], messages: Optional[List[dict]], sources: List[dict]) -> dict:
    chunks_tracing = []
    for idx, r in enumerate(results, 1):
        p_start = r.get("page_number_start", r.get("page_number"))
        p_end = r.get("page_number_end", r.get("page_number"))
        p_label = f"pages {p_start}-{p_end}" if p_start != p_end else f"page {p_start}"
        chunks_tracing.append({
            "chunk_index": idx,
            "document_title": r.get("title", ""),
            "region": r.get("region", "GENERAL"),
            "page_range": p_label,
            "combined_score": round(float(r.get("combined_score", 0.0)), 4),
            "content_snippet": r.get("parent_content") or r.get("page_content") or "",
        })

    prompt_context = None
    if messages and len(messages) > 0:
        prompt_context = messages[-1].get("content", "")

    return {
        "retrieved_chunks_count": len(results),
        "postgres_chunks": chunks_tracing,
        "prompt_context_fed_to_gemini": prompt_context,
        "citation_mapping": [
            {
                "citation": f"[{i+1}]",
                "title": s["title"],
                "page_number": s["page_number"],
            }
            for i, s in enumerate(sources or [])
        ],
    }


async def answer_query(query: str, session_id: Optional[str] = None) -> dict:
    """Run the full RAG pipeline. Returns a dict for ChatResponse."""
    start = time.monotonic()
    factory = get_session_factory()
    cached_info, results, messages, query_embedding = await _prepare(query, session_id)

    if cached_info is not None:
        reindexed_answer, final_sources = _reindex_citations(cached_info["response"], results)
        debug_info = _build_debug_tracing(results, messages, final_sources)
        msg_id = await _finalize(factory, query, reindexed_answer, query_embedding, 0, 0, 0.0,
                        cache_hit=True, start=start, session_id=session_id,
                        cached_query_id=cached_info["id"], cached_query_text=cached_info["query_text"],
                        sources=final_sources)
        return {
            "answer": reindexed_answer,
            "sources": final_sources,
            "cost_usd": 0.0,
            "cache_hit": True,
            "session_id": session_id,
            "message_id": msg_id,
            "debug_tracing": debug_info,
        }

    answer, in_tokens, out_tokens, cost = await _generate(messages, results)
    reindexed_answer, final_sources = _reindex_citations(answer, results)
    debug_info = _build_debug_tracing(results, messages, final_sources)
    msg_id = await _finalize(factory, query, reindexed_answer, query_embedding, in_tokens, out_tokens,
                    cost, cache_hit=False, start=start, session_id=session_id,
                    sources=final_sources)

    return {
        "answer": reindexed_answer,
        "sources": final_sources,
        "cost_usd": round(cost, 6),
        "cache_hit": False,
        "session_id": session_id,
        "message_id": msg_id,
        "debug_tracing": debug_info,
    }


async def answer_query_stream(query: str, session_id: Optional[str] = None):
    """Run the full RAG pipeline and yield SSE event dicts."""
    start = time.monotonic()
    factory = get_session_factory()
    cached_info, results, messages, query_embedding = await _prepare(query, session_id)

    if cached_info is not None:
        reindexed_answer, final_sources = _reindex_citations(cached_info["response"], results)
        debug_info = _build_debug_tracing(results, messages, final_sources)
        msg_id = await _finalize(factory, query, reindexed_answer, query_embedding, 0, 0, 0.0,
                        cache_hit=True, start=start, session_id=session_id,
                        cached_query_id=cached_info["id"], cached_query_text=cached_info["query_text"],
                        sources=final_sources)
        yield {"delta": reindexed_answer}
        yield {"done": True, "answer": reindexed_answer, "sources": final_sources, "cost_usd": 0.0,
               "cache_hit": True, "session_id": session_id, "message_id": msg_id, "debug_tracing": debug_info}
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

    reindexed_answer, final_sources = _reindex_citations(answer, results)
    cost = _calculate_cost(in_tokens, out_tokens)
    debug_info = _build_debug_tracing(results, messages, final_sources)
    msg_id = await _finalize(factory, query, reindexed_answer, query_embedding, in_tokens, out_tokens,
                    cost, cache_hit=False, start=start, session_id=session_id,
                    sources=final_sources)
    yield {"done": True, "answer": reindexed_answer, "sources": final_sources, "cost_usd": round(cost, 6),
           "cache_hit": False, "session_id": session_id, "message_id": msg_id, "debug_tracing": debug_info}


async def clear_cache() -> int:
    factory = get_session_factory()
    async with factory() as session:
        return await CacheRepository(session).clear_all()


async def get_history(session_id: str) -> List[dict]:
    factory = get_session_factory()
    async with factory() as session:
        msgs = await ChatMessageRepository(session).recent(session_id, limit=50)
    return [
        {
            "id": str(m.id),
            "role": m.role,
            "content": m.content,
            "sources": m.sources or [],
            "created_at": to_malaysia(m.created_at).strftime("%d/%m/%Y, %H:%M:%S") if m.created_at else None,
            "feedback_rating": getattr(m, "feedback_rating", None),
        }
        for m in msgs
    ]
