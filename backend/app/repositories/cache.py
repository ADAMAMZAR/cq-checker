"""Repository for semantic query cache."""

from typing import Optional
from uuid import UUID

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tables import QueryCache


class CacheRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def put(self, query_text: str, cached_response: str, query_embedding: Optional[List[float]] = None) -> QueryCache:
        record = QueryCache(
            query_text=query_text,
            cached_response=cached_response,
            query_embedding=query_embedding,
        )
        self.session.add(record)
        await self.session.commit()
        await self.session.refresh(record)
        return record

    async def find_cached(self, query_embedding: List[float], threshold: float = 0.93) -> Optional[QueryCache]:
        """Find a cached response with cosine similarity above threshold.

        Cosine similarity = 1 - (cosine_distance / 2) for unit vectors.
        For pgvector, 1 - (embedding <=> query_embedding) gives cosine similarity.
        """
        embedding_str = f"[{','.join(str(v) for v in query_embedding)}]"
        result = await self.session.execute(
            text(f"""
                SELECT id, query_text, cached_response, created_at
                FROM query_cache
                WHERE 1 - (query_embedding <=> '{embedding_str}'::vector(1536)) > :threshold
                ORDER BY query_embedding <=> '{embedding_str}'::vector(1536) ASC
                LIMIT 1
            """),
            {"threshold": threshold},
        )
        row = result.fetchone()
        if row is None:
            return None
        return QueryCache(
            id=row[0],
            query_text=row[1],
            cached_response=row[2],
            created_at=row[3],
        )

    async def clear_all(self) -> int:
        result = await self.session.execute(select(func.count(QueryCache.id)))
        count = result.scalar() or 0
        await self.session.execute(text("DELETE FROM query_cache"))
        await self.session.commit()
        return count
