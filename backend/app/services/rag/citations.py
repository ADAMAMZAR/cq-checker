import re
from typing import List, Optional, Tuple

RE_BRACKETS = re.compile(r'\[([\d\s,]+)\]')


def _sanitize_text(text: str) -> str:
    if not text:
        return ""
    return (
        text.replace(r"$\rightarrow$", "→")
        .replace(r"\rightarrow", "→")
        .replace(r"$\Rightarrow$", "⇒")
        .replace(r"\Rightarrow", "⇒")
    )


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


def _reindex_citations(answer: str, results: List[dict]) -> Tuple[str, List[dict]]:
    """Re-index bracket citations e.g. [1], [2] in LLM answer to sequential citation chips."""
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

    bracket_matches = RE_BRACKETS.findall(answer)
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

    reindexed_answer = RE_BRACKETS.sub(replace_bracket, answer)
    return reindexed_answer, ordered_sources
