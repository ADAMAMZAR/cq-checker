"""Repositories for chat sessions, messages, and cost logs."""

from typing import List, Optional
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tables import ChatSession, ChatMessage, ChatLog


class ChatSessionRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_session_id(self, session_id: str) -> Optional[ChatSession]:
        result = await self.session.execute(
            select(ChatSession).where(ChatSession.session_id == session_id)
        )
        return result.scalar_one_or_none()

    async def get_or_create(self, session_id: str) -> ChatSession:
        existing = await self.get_by_session_id(session_id)
        if existing:
            return existing
        record = ChatSession(session_id=session_id)
        self.session.add(record)
        await self.session.commit()
        await self.session.refresh(record)
        return record


class ChatMessageRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def add(self, session_id: str, role: str, content: str) -> ChatMessage:
        await ChatSessionRepository(self.session).get_or_create(session_id)
        record = ChatMessage(session_id=session_id, role=role, content=content)
        self.session.add(record)
        await self.session.commit()
        await self.session.refresh(record)
        return record

    async def recent(self, session_id: str, limit: int = 20) -> List[ChatMessage]:
        result = await self.session.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at.asc())
            .limit(limit)
        )
        return list(result.scalars().all())


class ChatLogRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def add(
        self,
        query_text: str,
        input_tokens: int = 0,
        output_tokens: int = 0,
        cost_usd: float = 0.0,
        cache_hit: bool = False,
        latency_ms: int = 0,
    ) -> ChatLog:
        record = ChatLog(
            query_text=query_text,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=round(float(cost_usd), 6),
            cache_hit=1 if cache_hit else 0,
            latency_ms=latency_ms,
        )
        self.session.add(record)
        await self.session.commit()
        await self.session.refresh(record)
        return record
