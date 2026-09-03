from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from app.db.session import get_session_factory
from app.models.tables import ChatLog, Document, DocumentPage
from app.repositories.supplier_audit import DocumentEvidenceRepository
from app.services.audit_data.serializers import MYR_RATE, _display_timestamp


async def get_cost_analytics() -> dict:
    factory = get_session_factory()
    async with factory() as session:
        # 1. CQ Checker (Supplier Audits)
        ev_repo = DocumentEvidenceRepository(session)
        evidence_records = await ev_repo.list_all(limit=100000)

        cq_total_cost_usd = 0.0
        supplier_map: dict = {}
        for r in evidence_records:
            name = r.supplier_name or "Unknown"
            c_usd = float(r.cost_usd or 0.0)
            cq_total_cost_usd += c_usd
            if name not in supplier_map:
                supplier_map[name] = {"supplier_name": name, "document_count": 0, "cost_usd": 0.0, "cost_myr": 0.0}
            supplier_map[name]["document_count"] += 1
            supplier_map[name]["cost_usd"] += c_usd
            supplier_map[name]["cost_myr"] += c_usd * MYR_RATE

        cq_breakdown = sorted(supplier_map.values(), key=lambda s: s["cost_usd"], reverse=True)
        cq_total_documents = len(evidence_records)
        cq_total_cost_myr = cq_total_cost_usd * MYR_RATE

        # 2. Chatbot RAG
        chat_res = await session.execute(
            select(ChatLog).order_by(ChatLog.created_at.desc()).limit(1000)
        )
        chat_records = list(chat_res.scalars().all())

        chat_total_cost_usd = sum(float(c.cost_usd or 0.0) for c in chat_records)
        chat_total_cost_myr = chat_total_cost_usd * MYR_RATE
        chat_in_tokens = sum(c.input_tokens or 0 for c in chat_records)
        chat_out_tokens = sum(c.output_tokens or 0 for c in chat_records)
        chat_cache_hits = sum(1 for c in chat_records if c.cache_hit == 1)

        chat_logs_list = [
            {
                "id": str(c.id),
                "query_text": c.query_text,
                "input_tokens": c.input_tokens or 0,
                "output_tokens": c.output_tokens or 0,
                "cost_usd": float(c.cost_usd or 0.0),
                "cost_myr": round(float(c.cost_usd or 0.0) * MYR_RATE, 4),
                "cache_hit": c.cache_hit == 1,
                "latency_ms": c.latency_ms or 0,
                "cached_query_text": c.cached_query_text,
                "created_at": _display_timestamp(c.created_at),
            }
            for c in chat_records
        ]

        # 3. Document Ingestion
        doc_res = await session.execute(
            select(Document).options(joinedload(Document.object_storage)).order_by(Document.created_at.desc()).limit(1000)
        )
        doc_records = list(doc_res.scalars().all())

        ingest_total_cost_usd = sum(float(d.cost_usd or 0.0) for d in doc_records)
        ingest_total_cost_myr = ingest_total_cost_usd * MYR_RATE
        ingest_in_tokens = sum(d.input_tokens or 0 for d in doc_records)
        ingest_out_tokens = sum(d.output_tokens or 0 for d in doc_records)

        pages_res = await session.execute(select(func.count(DocumentPage.id)))
        ingest_total_pages = pages_res.scalar() or 0

        # Batch count document pages to avoid N+1 query overhead
        page_counts_res = await session.execute(
            select(DocumentPage.document_id, func.count(DocumentPage.id))
            .group_by(DocumentPage.document_id)
        )
        page_count_map = {row[0]: row[1] for row in page_counts_res.all()}

        doc_list = []
        for d in doc_records:
            p_cnt = page_count_map.get(d.id, 0)
            doc_list.append({
                "id": str(d.id),
                "title": d.title,
                "file_url": d.file_url,
                "page_count": p_cnt,
                "input_tokens": d.input_tokens or 0,
                "output_tokens": d.output_tokens or 0,
                "cost_usd": float(d.cost_usd or 0.0),
                "cost_myr": round(float(d.cost_usd or 0.0) * MYR_RATE, 4),
                "created_at": _display_timestamp(d.created_at),
            })

    master_cost_usd = cq_total_cost_usd + chat_total_cost_usd + ingest_total_cost_usd
    master_cost_myr = master_cost_usd * MYR_RATE

    return {
        "master_cost_usd": round(master_cost_usd, 6),
        "master_cost_myr": round(master_cost_myr, 4),
        "total_cost_myr": round(cq_total_cost_myr, 4),
        "total_documents": cq_total_documents,
        "average_cost_myr": round(cq_total_cost_myr / cq_total_documents, 4) if cq_total_documents else 0.0,
        "breakdown": [{**s, "cost_usd": round(s["cost_usd"], 6), "cost_myr": round(s["cost_myr"], 4)} for s in cq_breakdown],
        "cq_checker": {
            "total_cost_usd": round(cq_total_cost_usd, 6),
            "total_cost_myr": round(cq_total_cost_myr, 4),
            "total_documents": cq_total_documents,
            "average_cost_myr": round(cq_total_cost_myr / cq_total_documents, 4) if cq_total_documents else 0.0,
            "breakdown": [{**s, "cost_usd": round(s["cost_usd"], 6), "cost_myr": round(s["cost_myr"], 4)} for s in cq_breakdown],
        },
        "chatbot": {
            "total_cost_usd": round(chat_total_cost_usd, 6),
            "total_cost_myr": round(chat_total_cost_myr, 4),
            "total_queries": len(chat_records),
            "cache_hits": chat_cache_hits,
            "cache_hit_rate_pct": round((chat_cache_hits / len(chat_records) * 100), 1) if chat_records else 0.0,
            "input_tokens": chat_in_tokens,
            "output_tokens": chat_out_tokens,
            "logs": chat_logs_list,
        },
        "ingestion": {
            "total_cost_usd": round(ingest_total_cost_usd, 6),
            "total_cost_myr": round(ingest_total_cost_myr, 4),
            "total_documents": len(doc_records),
            "total_pages": ingest_total_pages,
            "input_tokens": ingest_in_tokens,
            "output_tokens": ingest_out_tokens,
            "documents": doc_list,
        },
    }
