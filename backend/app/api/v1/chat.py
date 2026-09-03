import json
import uuid
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.db.session import get_session_factory
from app.models.tables import ChatMessage
from app.repositories.chat import ChatFeedbackRepository, ChatMessageRepository
from app.schemas import (
    ChatHistoryResponse,
    ChatRequest,
    ChatResponse,
    ChatSource,
    FeedbackRequest,
    FeedbackResponse,
)
from app.services import rag

router = APIRouter()


@router.post("/api/chat", response_model=ChatResponse, tags=["RAG Chatbot"])
async def chat(payload: ChatRequest):
    if not payload.query.strip():
        raise HTTPException(status_code=400, detail="Query text cannot be empty.")

    if payload.stream:
        async def event_stream():
            try:
                async for event in rag.answer_query_stream(
                    payload.query, session_id=payload.session_id
                ):
                    yield f"data: {json.dumps(event)}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                yield "data: [DONE]\n\n"

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    result = await rag.answer_query(payload.query, session_id=payload.session_id)
    return ChatResponse(
        answer=result["answer"],
        sources=[ChatSource(**s) for s in result["sources"]],
        cost_usd=result["cost_usd"],
        cache_hit=result["cache_hit"],
        session_id=result["session_id"],
        message_id=result.get("message_id"),
    )


@router.post("/api/chat/cache/clear", tags=["RAG Chatbot"])
async def clear_chat_cache():
    count = await rag.clear_cache()
    return {"status": "success", "cleared": count}


@router.get("/api/chat/history", response_model=ChatHistoryResponse, tags=["RAG Chatbot"])
async def chat_history(session_id: str):
    if not session_id.strip():
        raise HTTPException(status_code=400, detail="session_id cannot be empty.")
    messages = await rag.get_history(session_id)
    return ChatHistoryResponse(session_id=session_id, messages=messages)


@router.post("/api/chat/feedback", response_model=FeedbackResponse, tags=["RAG Chatbot"])
async def chat_feedback(payload: FeedbackRequest):
    if payload.rating not in ("satisfied", "not_satisfied"):
        raise HTTPException(status_code=400, detail="rating must be 'satisfied' or 'not_satisfied'")

    try:
        msg_uuid = uuid.UUID(payload.message_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid message_id format")

    factory = get_session_factory()
    async with factory() as session:
        msg_repo = ChatMessageRepository(session)
        result = await session.execute(select(ChatMessage).where(ChatMessage.id == msg_uuid))
        msg = result.scalar_one_or_none()
        if not msg:
            raise HTTPException(status_code=404, detail="Message not found")

        fb_repo = ChatFeedbackRepository(session)
        existing = await fb_repo.get_by_message_id(msg_uuid)
        if existing:
            raise HTTPException(status_code=409, detail="Feedback already submitted for this message")

        record = await fb_repo.add(
            message_id=msg_uuid,
            session_id=payload.session_id,
            rating=payload.rating,
            reason=payload.reason,
        )
        return FeedbackResponse(
            id=str(record.id),
            message_id=str(record.message_id),
            rating=record.rating,
            reason=record.reason,
            created_at=record.created_at.isoformat() if record.created_at else None,
        )
