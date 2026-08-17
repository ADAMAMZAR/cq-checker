"""Hybrid retrieval: pgvector cosine + tsvector full-text search with Sub-Workflow Windowing.

1-Stage: pgvector + BM25 hybrid search finds top seed pages.
2-Stage: Fetches contiguous adjacent pages for each seed hit, merging overlapping page ranges
         into unified multi-page context blocks for Gemini.
"""

from typing import List, Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def hybrid_search(
    session: AsyncSession,
    query_embedding: List[float],
    query_text: str,
    k: int = 3,
    window_size: int = 4,
    target_regions: Optional[List[str]] = None,
) -> List[dict]:
    """Return top-k matching document pages expanded into contiguous multi-page sub-workflows.

    Parameters:
        k: Number of seed matching pages to retrieve.
        window_size: Number of forward adjacent pages to include for multi-page procedures.
        target_regions: Optional list of region codes (e.g. ["VN", "GENERAL"]) to filter documents.
    """
    embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"

    # Expand procurement synonyms for full-text search query
    import re
    search_q = query_text
    if re.search(r"\b(rfq|rfp|rft|sourcing|tender|quotation|proposal)\b", query_text.lower()):
        search_q = query_text + " RFP RFT RFQ Sourcing Tender"

    # Region filter SQL clause
    region_clause = ""
    params = {"q": search_q, "k": k}
    if target_regions:
        region_clause = "AND (d.region = ANY(:target_regions) OR d.region = 'GENERAL')"
        params["target_regions"] = list(target_regions)

    # Stage 1: Retrieve top-k seed page hits
    sql = text(f"""
        SELECT
            dp.id AS page_id,
            dp.content AS page_content,
            dp.page_number AS page_number,
            d.id AS document_id,
            d.title AS title,
            d.region AS region,
            COALESCE(os.file_url, '') AS file_url,
            COALESCE(os.content_type, '') AS content_type,
            (0.6 * (1 - (dp.embedding <=> '{embedding_str}'::vector(1536)))
             + 0.4 * COALESCE(ts_rank_cd(dp.tsv_content, websearch_to_tsquery('english', :q)), 0)) AS combined_score
        FROM document_pages dp
        JOIN documents d ON d.id = dp.document_id
        LEFT JOIN object_storage os ON os.id = d.object_id
        WHERE dp.embedding IS NOT NULL
        {region_clause}
        ORDER BY combined_score DESC
        LIMIT :k
    """)
    result = await session.execute(sql, params)
    seed_hits = []
    for r in result:
        seed_hits.append({
            "page_id": r.page_id,
            "page_content": r.page_content or "",
            "page_number": r.page_number,
            "document_id": r.document_id,
            "title": r.title,
            "region": getattr(r, "region", "GENERAL") or "GENERAL",
            "file_url": r.file_url,
            "content_type": r.content_type,
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

    # Group seed hits by document_id to merge overlapping page ranges and seed page lists
    doc_seeds_map = {}
    for s in seed_hits:
        d_id = s["document_id"]
        if d_id not in doc_seeds_map:
            doc_seeds_map[d_id] = {
                "top_seed_hit": s,
                "seed_pages": [s["page_number"]],
            }
        else:
            doc_seeds_map[d_id]["seed_pages"].append(s["page_number"])

    # Build final results with deduplicated multi-page parent_content
    results = []
    for d_id, info in doc_seeds_map.items():
        s = info["top_seed_hit"]
        seed_pages = info["seed_pages"]

        avail_pages = doc_pages_map.get(d_id, {})
        if not avail_pages:
            continue

        p_start = min(avail_pages.keys())
        p_end = max(avail_pages.keys())

        stitched_parts = []
        for p in sorted(avail_pages.keys()):
            txt = avail_pages[p].strip()
            if txt:
                stitched_parts.append(f"--- Page {p} ---\n{txt}")

        stitched_content = "\n\n".join(stitched_parts) if stitched_parts else s["page_content"]

        results.append({
            "page_id": s["page_id"],
            "page_content": s["page_content"],
            "parent_content": stitched_content,
            "page_number": s["page_number"],
            "seed_pages": seed_pages,
            "page_number_start": p_start,
            "page_number_end": p_end,
            "document_id": d_id,
            "title": s["title"],
            "region": s.get("region", "GENERAL"),
            "file_url": s["file_url"],
            "content_type": s.get("content_type", ""),
            "combined_score": s["combined_score"],
        })

    return results
