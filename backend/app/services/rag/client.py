import sys
import os

# Workaround Protobuf Python 3.14 C-extension incompatibilities
sys.modules['google._upb._message'] = None
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

import logging
from typing import List, Optional, Tuple

from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger(__name__)

_client: Optional[genai.Client] = None

INPUT_RATE = 0.30 / 1_000_000
OUTPUT_RATE = 2.50 / 1_000_000


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


def _calculate_cost(in_tokens: int, out_tokens: int) -> float:
    return (in_tokens * INPUT_RATE) + (out_tokens * OUTPUT_RATE)


def _split_messages(messages: List[dict]) -> Tuple[Optional[str], List[dict]]:
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


def _call_gemini(messages: List[dict]) -> Tuple[str, int, int]:
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
    """Stream Gemini completions. Yields (delta_text, usage_or_None) tuples."""
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
    """Grounded answer when Gemini is unavailable — quotes top parents."""
    if not results:
        return "No relevant manuals found for this query."
    lines = ["Here are the most relevant passages from the manuals:"]
    for i, r in enumerate(results[:3], 1):
        snippet = (r["parent_content"] or "")[:400]
        lines.append(f"[{i}] {r['title']} (page {r['page_number']}): {snippet}")
    return "\n".join(lines)
