"""Hybrid retrieval: pgvector cosine + tsvector full-text search.

Single SQL query joins child_chunks -> parent_chunks -> documents, combines
vector similarity and BM25-style text rank into one score, returns top-k.
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
    """Return top-k matching children with parent + document context.

    Each result:
      {
        "child_id", "child_content", "parent_id", "parent_content",
        "page_number", "document_id", "title", "file_url", "combined_score",
      }
    """
    embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"

    sql = text(f"""
        SELECT
            cc.id AS child_id,
            cc.content AS child_content,
            pc.id AS parent_id,
            pc.content AS parent_content,
            pc.page_number AS page_number,
            d.id AS document_id,
            d.title AS title,
            d.file_url AS file_url,
            (0.6 * (1 - (cc.embedding <=> '{embedding_str}'::vector(1536)))
             + 0.4 * COALESCE(ts_rank_cd(cc.tsv_content, websearch_to_tsquery('english', :q)), 0)) AS combined_score
        FROM child_chunks cc
        JOIN parent_chunks pc ON pc.id = cc.parent_id
        JOIN documents d ON d.id = pc.document_id
        WHERE cc.embedding IS NOT NULL
        ORDER BY combined_score DESC
        LIMIT :k
    """)
    result = await session.execute(sql, {"q": query_text, "k": k})
    rows = []
    for r in result:
        rows.append({
            "child_id": r.child_id,
            "child_content": r.child_content,
            "parent_id": r.parent_id,
            "parent_content": r.parent_content,
            "page_number": r.page_number,
            "document_id": r.document_id,
            "title": r.title,
            "file_url": r.file_url,
            "combined_score": float(r.combined_score or 0.0),
        })
    return rows
