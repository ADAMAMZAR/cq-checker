"""Hybrid retrieval: pgvector cosine + tsvector full-text search with Sub-Workflow Windowing.

1-Stage: pgvector + BM25 hybrid search finds top seed pages.
2-Stage: Fetches contiguous adjacent pages for each seed hit, merging overlapping page ranges
         into unified multi-page context blocks for Gemini.
"""

from typing import List
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def hybrid_search(
    session: AsyncSession,
    query_embedding: List[float],
    query_text: str,
    k: int = 3,
    window_size: int = 4,
) -> List[dict]:
    """Return top-k matching document pages expanded into contiguous multi-page sub-workflows.

    Parameters:
        k: Number of seed matching pages to retrieve.
        window_size: Number of forward adjacent pages to include for multi-page procedures.

    Each result:
      {
        "page_id", "page_content", "parent_content", "page_number",
        "page_number_start", "page_number_end", "document_id", "title",
        "file_url", "combined_score",
      }
    """
    embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"

    # Expand procurement synonyms for full-text search query
    import re
    search_q = query_text
    if re.search(r"\b(rfq|rfp|rft|sourcing|tender|quotation|proposal)\b", query_text.lower()):
        search_q = query_text + " RFP RFT RFQ Sourcing Tender"

    # Stage 1: Retrieve top-k seed page hits
    sql = text(f"""
        SELECT
            dp.id AS page_id,
            dp.content AS page_content,
            dp.page_number AS page_number,
            d.id AS document_id,
            d.title AS title,
            COALESCE(os.file_url, '') AS file_url,
            (0.6 * (1 - (dp.embedding <=> '{embedding_str}'::vector(1536)))
             + 0.4 * COALESCE(ts_rank_cd(dp.tsv_content, plainto_tsquery('english', :q)), 0)) AS combined_score
        FROM document_pages dp
        JOIN documents d ON d.id = dp.document_id
        LEFT JOIN object_storage os ON os.id = d.object_id
        WHERE dp.embedding IS NOT NULL
        ORDER BY combined_score DESC
        LIMIT :k
    """)
    result = await session.execute(sql, {"q": search_q, "k": k})
    seed_hits = []
    for r in result:
        seed_hits.append({
            "page_id": r.page_id,
            "page_content": r.page_content or "",
            "page_number": r.page_number,
            "document_id": r.document_id,
            "title": r.title,
            "file_url": r.file_url,
            "combined_score": float(r.combined_score or 0.0),
        })

    if not seed_hits:
        return []

    # Stage 2: Sub-Workflow Windowing — Fetch adjacent pages for each seed hit
    conditions = []
    for s in seed_hits:
        p_start = max(1, s["page_number"] - 1)
        p_end = s["page_number"] + window_size
        conditions.append(f"(dp.document_id = '{s['document_id']}' AND dp.page_number BETWEEN {p_start} AND {p_end})")

    window_sql = text(f"""
        SELECT
            dp.id AS page_id,
            dp.content AS page_content,
            dp.page_number AS page_number,
            dp.document_id AS document_id
        FROM document_pages dp
        WHERE {" OR ".join(conditions)}
        ORDER BY dp.document_id, dp.page_number ASC
    """)
    window_res = await session.execute(window_sql)

    # Group contiguous pages by document_id
    doc_pages_map = {}
    for wr in window_res:
        d_id = wr.document_id
        if d_id not in doc_pages_map:
            doc_pages_map[d_id] = {}
        doc_pages_map[d_id][wr.page_number] = wr.page_content or ""

    # Build final results with stitched multi-page parent_content
    results = []
    processed_ranges = set()

    for s in seed_hits:
        d_id = s["document_id"]
        seed_p = s["page_number"]
        p_start = max(1, seed_p - 1)
        p_end = seed_p + window_size

        avail_pages = doc_pages_map.get(d_id, {})
        contiguous_nums = [p for p in sorted(avail_pages.keys()) if p_start <= p <= p_end]

        range_key = (d_id, min(contiguous_nums or [seed_p]), max(contiguous_nums or [seed_p]))
        if range_key in processed_ranges:
            continue
        processed_ranges.add(range_key)

        stitched_parts = []
        for p in contiguous_nums:
            txt = avail_pages.get(p, "").strip()
            if txt:
                stitched_parts.append(f"--- Page {p} ---\n{txt}")

        stitched_content = "\n\n".join(stitched_parts) if stitched_parts else s["page_content"]

        results.append({
            "page_id": s["page_id"],
            "page_content": s["page_content"],
            "parent_content": stitched_content,
            "page_number": seed_p,
            "page_number_start": min(contiguous_nums or [seed_p]),
            "page_number_end": max(contiguous_nums or [seed_p]),
            "document_id": d_id,
            "title": s["title"],
            "file_url": s["file_url"],
            "combined_score": s["combined_score"],
        })

    return results
