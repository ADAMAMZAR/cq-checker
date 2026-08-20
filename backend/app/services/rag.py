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
from typing import List, Optional, Tuple

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
INPUT_RATE = 0.30 / 1_000_000
OUTPUT_RATE = 2.50 / 1_000_000

SYSTEM_PROMPT = (
    "Role: Support Assistant for Vendor Onboarding and Ariba queries. Guidance strictly from sources.\n\n"
    "1. Search Order Hierarchy & Versioning:\n"
    "   - Target 1 (FAQ): Priority match. Target 2 (Flowchart): Use if absent from Target 1. Target 3 (PDF Guides/Memos): Use only for granular field details absent from 1 & 2.\n"
    "   - Version Priority: Use exclusively the most recent document by date. Ignore superseded versions.\n\n"
    "2. Regional & Language Routing Protocols:\n"
    "   - Classification: MY, AU, TW, VN, or General.\n"
    "   - Language Rules: Malaysia (MY), Australia (AU), & General -> English. Taiwan (TW) -> Traditional Chinese (繁體中文). Vietnam (VN) -> Vietnamese (Tiếng Việt).\n"
    "   - User Query Override: If user explicitly asks in English about TW or VN, reply in English.\n"
    "   - Deduplication: If a rule is identical across regions, output the answer ONCE in English. If rules differ across regions, split into explicit regional blocks (Malaysia:, Australia:, Taiwan (台灣):, Vietnam (Việt Nam):).\n\n"
    "3. Response Formatting & Citations:\n"
    "   - Format step-by-step procedures as an explicit Markdown numbered list ('1. ', '2. '). Use plain text or unicode arrows ('→' or '->'). NEVER output LaTeX math (e.g. \\rightarrow).\n"
    "   - Mandatory PostgreSQL citation brackets like [1] or [2] attached to each statement. No greetings, filler, or closing offers.\n\n"
    "4. Special Workflows & Policy Phrasing:\n"
    "   - Portal / Event Link: If user asks for access link, respond strictly with: https://supplier.ariba.com\n"
    "   - Non-Ariba Vendors: Direct to GPO Business Partner Maintenance Form.\n"
    "   - Mandatory Phrasing: Mention RM100k/GAPP policy only if asked. Always use verbatim 'shall be implemented through' and '...as the Group Accounting Policy and Procedures (GAPP) no G-011-General (on Payments) has been amended accordingly.' Auction ceiling price -> 'the ceiling price confirmation shall be implemented through the SAP Ariba Platform.'\n\n"
    "5. Out-of-Scope Queries:\n"
    "   - If unrelated to onboarding, Ariba, procurement, or business partner maintenance, respond verbatim:\n"
    "     'I apologize, but my assistance is limited to vendor onboarding and Ariba-related queries. Please let me know if you have a question regarding a supplier's registration guide, profile maintenance or policy.'"
)


def _check_fast_rule_interceptor(query_text: str) -> Optional[dict]:
    """Fast $0.00 LLM cost interceptor for deterministic queries."""
    import re
    q = query_text.lower().strip()

    # 1. Portal / Event link queries -> Return URL directly with $0.00 cost
    if any(k in q for k in ["portal link", "ariba link", "access link", "event link", "questionnaire link", "url to access"]):
        return {
            "answer": "https://supplier.ariba.com",
            "sources": [],
        }

    # 2. Obvious out-of-scope topics -> Return standard refusal immediately
    out_of_scope_patterns = [
        r"\b(recipe|cook|bake|weather|forecast|movie|song|joke|sport|football|soccer|cricket|fifa|world cup|olympics|match|tournament|trophy)\b",
        r"\bwho (is|was|will) (president|prime minister|actor|singer|coach|win|winner)\b",
        r"\b(which|what) (team|country|player) (win|won|will win)\b",
        r"\bhow to (code|program|build a website|fix my car)\b",
    ]
    if any(re.search(p, q) for p in out_of_scope_patterns):
        return {
            "answer": "I apologize, but my assistance is limited to vendor onboarding and Ariba-related queries. Please let me know if you have a question regarding a supplier's registration guide, profile maintenance or policy.",
            "sources": [],
        }

    return None


def _calculate_cost(in_tokens: int, out_tokens: int) -> float:
    return (in_tokens * INPUT_RATE) + (out_tokens * OUTPUT_RATE)


def _build_context(results: List[dict]) -> str:
    blocks = []
    for i, r in enumerate(results, 1):
        content = r.get("parent_content") or r.get("page_content") or ""
        p_start = r.get("page_number_start", r.get("page_number"))
        p_end = r.get("page_number_end", r.get("page_number"))
        p_label = f"pages {p_start}-{p_end}" if p_start != p_end else f"page {p_start}"
        blocks.append(
            f"[{i}] (source: {r['title']}, {p_label})\n{content}"
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


def _sanitize_text(text: str) -> str:
    if not text:
        return ""
    return (
        text.replace(r"$\rightarrow$", "→")
        .replace(r"\rightarrow", "→")
        .replace(r"$\Rightarrow$", "⇒")
        .replace(r"\Rightarrow", "⇒")
    )


def _reindex_citations(answer: str, results: List[dict]) -> Tuple[str, List[dict]]:
    """Re-index citation numbers in Gemini's answer so every response starts cleanly at [1].

    Guarantees that citation [N] in the text maps 1-to-1 with ordered_sources[N - 1].
    """
def _reindex_citations(answer: str, results: List[dict]) -> tuple[str, List[dict]]:
    """Reindex bracket citations e.g. [1], [2], [75] in LLM answer to sequential citation chips."""
    import re
    answer = _sanitize_text(answer)
    if not results or not answer:
        return answer, []

    def find_result_by_num(num: int) -> Optional[dict]:
        if 1 <= num <= len(results):
            return results[num - 1]
        for r in results:
            if r.get("page_number") == num:
                return r
        return None

    bracket_matches = re.findall(r'\[([\d\s,]+)\]', answer)
    raw_nums = []
    for match in bracket_matches:
        for n_str in match.split(','):
            if n_str.strip().isdigit():
                num = int(n_str.strip())
                r_found = find_result_by_num(num)
                if r_found and num not in raw_nums:
                    raw_nums.append(num)

    if not raw_nums:
        ordered_sources = []
        for r in results[:3]:
            ordered_sources.append({
                "title": r["title"],
                "page_number": r["page_number"],
                "snippet": (r["parent_content"] or "")[:300],
                "file_url": r.get("file_url"),
                "document_id": str(r["document_id"]) if r.get("document_id") else None,
                "content_type": r.get("content_type", ""),
            })
        return answer, ordered_sources

    ordered_sources = []
    seen_keys = {}
    old_to_new = {}

    for old_num in raw_nums:
        r = find_result_by_num(old_num)
        if not r:
            continue
        key = (r["title"], r["page_number"])
        if key not in seen_keys:
            new_idx = len(ordered_sources) + 1
            seen_keys[key] = new_idx
            ordered_sources.append({
                "title": r["title"],
                "page_number": r["page_number"],
                "snippet": (r["parent_content"] or "")[:300],
                "file_url": r.get("file_url"),
                "document_id": str(r["document_id"]) if r.get("document_id") else None,
                "content_type": r.get("content_type", ""),
            })
        old_to_new[old_num] = seen_keys[key]

    def replace_bracket(match_obj):
        raw_inside = match_obj.group(1)
        nums = [int(n.strip()) for n in raw_inside.split(',') if n.strip().isdigit()]
        if not nums:
            return match_obj.group(0)
        valid_new_nums = []
        for n in nums:
            if n in old_to_new:
                valid_new_nums.append(str(old_to_new[n]))
        if not valid_new_nums:
            return match_obj.group(0)
        return f"[{', '.join(valid_new_nums)}]"

    reindexed_answer = re.sub(r'\[([\d\s,]+)\]', replace_bracket, answer)
    return reindexed_answer, ordered_sources


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
            max_output_tokens=1200,
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
            max_output_tokens=768,
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


def normalize_query(query: str) -> str:
    """Clean conversational filler, lower-case, and trim whitespace/punctuation for cache matching."""
    if not query:
        return ""
    text = query.lower().strip()
    fillers = [
        "can you please tell me", "can you tell me", "can you show me",
        "could you please explain", "could you explain", "please tell me",
        "please explain", "what is the process to", "how do i", "how to",
        "show me", "tell me",
    ]
    for filler in fillers:
        if text.startswith(filler):
            text = text[len(filler):].strip()
            break
    text = text.rstrip("?!.,;:")
    return text or query.strip()


async def _prepare(query: str, session_id: Optional[str]):
    """Shared front-half: fast interceptor -> embed -> cache check -> retrieval -> build LLM messages.

    Returns ``(cached_info_or_None, results, messages, query_embedding)``.
    """
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

    from app.services.region_router import classify_query_intent
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


def _build_debug_tracing(results: List[dict], messages: Optional[List[dict]], sources: List[dict]) -> dict:
    """Temporary PostgreSQL retrieval & citation debug tracing."""
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


# ── helpers ──────────────────────────────────────────────────────────────────

def latency(start: float) -> int:
    return int((time.monotonic() - start) * 1000)


async def _append_history(factory, session_id: str, role: str, content: str, sources: Optional[List[dict]] = None):
    async with factory() as session:
        return await ChatMessageRepository(session).add(session_id, role, content, sources=sources)


async def _load_history(factory, session_id: str, limit: int = 6) -> List[dict]:
    async with factory() as session:
        msgs = await ChatMessageRepository(session).recent(session_id, limit=limit)
    return [{"role": m.role, "content": m.content} for m in msgs]


async def _log(factory, query: str, in_t: int, out_t: int, cost: float,
               cache_hit: bool, latency_ms: int, cached_query_id=None, cached_query_text=None) -> None:
    try:
        async with factory() as session:
            await ChatLogRepository(session).add(
                query, in_t, out_t, cost, cache_hit=cache_hit, latency_ms=latency_ms,
                cached_query_id=cached_query_id, cached_query_text=cached_query_text,
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
