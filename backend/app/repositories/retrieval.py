"""Hybrid retrieval: pgvector cosine + tsvector full-text search.

Single SQL query joins document_pages -> documents, combines vector similarity
and BM25-style text rank into one score, returns top-k matching pages.
"""

from typing import List
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def hybrid_search(
    session: AsyncSession,
    query_embedding: List[float],
    query_text: str,
    k: int = 3,
) -> List[dict]:
    """Return top-k matching document pages.

    Each result:
      {
        "page_id", "page_content", "parent_content", "page_number",
        "document_id", "title", "file_url", "combined_score",
      }
    """
    embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"

    sql = text(f"""
        SELECT
            dp.id AS page_id,
            dp.content AS page_content,
            dp.page_number AS page_number,
            d.id AS document_id,
            d.title AS title,
            COALESCE(os.file_url, '') AS file_url,
            (0.6 * (1 - (dp.embedding <=> '{embedding_str}'::vector(1536)))
             + 0.4 * COALESCE(ts_rank_cd(dp.tsv_content, websearch_to_tsquery('english', :q)), 0)) AS combined_score
        FROM document_pages dp
        JOIN documents d ON d.id = dp.document_id
        LEFT JOIN object_storage os ON os.id = d.object_id
        WHERE dp.embedding IS NOT NULL
        ORDER BY combined_score DESC
        LIMIT :k
    """)
    result = await session.execute(sql, {"q": query_text, "k": k})
    rows = []
    for r in result:
        content = r.page_content or ""
        rows.append({
            "page_id": r.page_id,
            "page_content": content,
            "parent_content": content,  # For backward-compatibility with rag.py context formatting
            "page_number": r.page_number,
            "document_id": r.document_id,
            "title": r.title,
            "file_url": r.file_url,
            "combined_score": float(r.combined_score or 0.0),
        })
    return rows
