"""Repository for semantic query cache."""

from typing import List, Optional
from uuid import UUID

from sqlalchemy import select, func, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tables import QueryCache


class CacheRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def put(self, query_text: str, cached_response: str, query_embedding: Optional[List[float]] = None) -> QueryCache:
        await self._evict_expired()
        record = QueryCache(
            query_text=query_text,
            cached_response=cached_response,
            query_embedding=query_embedding,
        )
        self.session.add(record)
        await self.session.commit()
        await self.session.refresh(record)
        return record

    async def find_cached(self, query_embedding: List[float], threshold: float = 0.93, ttl_days: Optional[int] = None) -> Optional[QueryCache]:
        """Find a cached response with cosine similarity above threshold.

        Cosine similarity = 1 - (cosine_distance / 2) for unit vectors.
        For pgvector, 1 - (embedding <=> query_embedding) gives cosine similarity.

        Rows older than ``ttl_days`` (if given) are ignored as stale.
        """
        embedding_str = f"[{','.join(str(v) for v in query_embedding)}]"
        ttl_clause = ""
        params = {"threshold": threshold}
        if ttl_days is not None:
            ttl_clause = "AND created_at > now() - make_interval(days => :ttl_days)"
            params["ttl_days"] = ttl_days
        result = await self.session.execute(
            text(f"""
                SELECT id, query_text, cached_response, created_at, hit_count
                FROM query_cache
                WHERE 1 - (query_embedding <=> '{embedding_str}'::vector(1536)) > :threshold
                {ttl_clause}
                ORDER BY query_embedding <=> '{embedding_str}'::vector(1536) ASC
                LIMIT 1
            """),
            params,
        )
        row = result.fetchone()
        if row is None:
            return None
        # Count the hit and stamp last_hit_at for analytics / LRU eviction.
        await self.session.execute(
            update(QueryCache)
            .where(QueryCache.id == row[0])
            .values(hit_count=QueryCache.hit_count + 1, last_hit_at=func.now())
        )
        await self.session.commit()
        return QueryCache(
            id=row[0],
            query_text=row[1],
            cached_response=row[2],
            created_at=row[3],
            hit_count=row[4],
        )

    async def _evict_expired(self, ttl_days: Optional[int] = None) -> int:
        """Lazily delete cache rows older than the TTL (default from config)."""
        from app.config import settings
        ttl = ttl_days if ttl_days is not None else settings.query_cache_ttl_days
        result = await self.session.execute(
            text("DELETE FROM query_cache WHERE created_at < now() - make_interval(days => :ttl)"),
            {"ttl": ttl},
        )
        await self.session.commit()
        return result.rowcount or 0

    async def clear_all(self) -> int:
        result = await self.session.execute(select(func.count(QueryCache.id)))
        count = result.scalar() or 0
        await self.session.execute(text("DELETE FROM query_cache"))
        await self.session.commit()
        return count
