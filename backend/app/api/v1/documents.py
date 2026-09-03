import re
import time
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from sqlalchemy import text

from app.db.session import get_session_factory
from app.repositories.documents import DocumentRepository, FolderRepository, PageRepository
from app.schemas import (
    CreateFolderRequest,
    DocumentFolderSummary,
    DocumentIngestResult,
    DocumentSummary,
    MoveDocumentRequest,
    RetrievalTestRequest,
    UpdateDocumentRegionRequest,
    UpdateFolderRequest,
)
from app.services import embeddings
from app.services.ingest import (
    bulk_ingest_documents,
    commit_ingest_pages,
    ingest_document,
    test_ingest_document,
)
from app.services.region_router import classify_query_intent
from app.services.timezones import to_malaysia

router = APIRouter()


@router.post("/api/documents/upload", response_model=DocumentIngestResult, tags=["Document Ingestion / RAG"])
@router.post("/api/documents/upload/", response_model=DocumentIngestResult, tags=["Document Ingestion / RAG"])
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    overwrite: bool = Form(True),
):
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file cannot be empty.")

    filename = file.filename or "manual.pdf"
    content_type = file.content_type or (
        "text/markdown" if filename.lower().endswith((".md", ".markdown", ".txt")) else "application/pdf"
    )
    raw_title = title or filename
    doc_title = re.sub(
        r"\.(pdf|pptx|docx|doc|ppt|xlsx|xls|png|jpg|jpeg|txt|md)$", "", raw_title, flags=re.IGNORECASE
    ).strip() or raw_title

    result = await ingest_document(file_bytes, doc_title, filename, content_type, overwrite=overwrite)
    if result.status == "failed":
        raise HTTPException(status_code=502, detail=result.message)
    return DocumentIngestResult(**result.to_dict())


@router.post("/api/documents/bulk-upload", tags=["Document Ingestion / RAG"])
@router.post("/api/documents/bulk-upload/", tags=["Document Ingestion / RAG"])
async def bulk_upload_documents(
    files: List[UploadFile] = File(...),
    overwrite: bool = Form(True),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided for bulk upload.")

    items = []
    for f in files:
        f_bytes = await f.read()
        fname = f.filename or "document.pdf"
        ctype = f.content_type or (
            "text/markdown" if fname.lower().endswith((".md", ".markdown", ".txt")) else "application/pdf"
        )
        items.append({
            "file_bytes": f_bytes,
            "filename": fname,
            "title": fname,
            "content_type": ctype,
        })

    results = await bulk_ingest_documents(items, overwrite=overwrite)
    return [r.to_dict() for r in results]


@router.post("/api/documents/test-ingest", tags=["Document Ingestion / RAG"])
@router.post("/api/documents/test-ingest/", tags=["Document Ingestion / RAG"])
async def test_upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    mode: str = Form("single"),
    page_number: int = Form(1),
):
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="File cannot be empty.")
    filename = file.filename or "manual.pdf"
    doc_title = title or filename

    try:
        res = await test_ingest_document(
            file_bytes=file_bytes,
            filename=filename,
            title=doc_title,
            mode=mode,
            page_number=page_number,
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/documents/commit-pages", tags=["Document Ingestion / RAG"])
@router.post("/api/documents/commit-pages/", tags=["Document Ingestion / RAG"])
async def commit_document_pages(payload: dict):
    filename = payload.get("filename", "manual.pdf")
    title = payload.get("title", filename)
    pages = payload.get("pages", [])
    if not pages:
        raise HTTPException(status_code=400, detail="No pages provided for commit.")

    try:
        res = await commit_ingest_pages(filename=filename, title=title, pages=pages)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/documents", response_model=List[DocumentSummary], tags=["Document Ingestion / RAG"])
async def list_documents(limit: int = 50, offset: int = 0):
    factory = get_session_factory()
    async with factory() as session:
        doc_repo = DocumentRepository(session)
        page_repo = PageRepository(session)
        docs = await doc_repo.list_all(limit=limit, offset=offset)

        summaries = []
        for doc in docs:
            counts = await page_repo.count_by_document(doc.id)
            p_cnt = counts.get("page_count", 0)
            summaries.append(DocumentSummary(
                id=str(doc.id),
                title=doc.title,
                file_url=doc.file_url,
                region=doc.region or "GENERAL",
                page_count=p_cnt,
                parent_count=p_cnt,
                child_count=p_cnt,
                folder_id=str(doc.folder_id) if doc.folder_id else None,
                folder_name=doc.folder_name,
                created_at=to_malaysia(doc.created_at).strftime("%d/%m/%Y, %H:%M:%S") if doc.created_at else None,
            ))
    return summaries


@router.get("/api/documents/{document_id}/content", tags=["Document Ingestion / RAG"])
async def get_document_content(document_id: str):
    try:
        d_uuid = UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document_id UUID.")

    factory = get_session_factory()
    async with factory() as session:
        doc_repo = DocumentRepository(session)
        page_repo = PageRepository(session)
        doc = await doc_repo.get_by_id(d_uuid)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found.")

        pages = await page_repo.list_pages(d_uuid)
        content_type = ""
        if doc.object_storage:
            content_type = doc.object_storage.content_type or ""

        page_list = [
            {"page_number": p.page_number, "content": p.content or ""}
            for p in pages
        ]

        return {
            "id": str(doc.id),
            "title": doc.title,
            "file_url": doc.file_url,
            "region": doc.region,
            "content_type": content_type,
            "page_count": len(page_list),
            "pages": page_list,
        }


# ── Document Folders API Endpoints ──────────────────────────────────────────

@router.get("/api/folders", response_model=List[DocumentFolderSummary], tags=["Document Ingestion / RAG"])
async def list_folders():
    factory = get_session_factory()
    async with factory() as session:
        repo = FolderRepository(session)
        folders = await repo.list_all()
        return [DocumentFolderSummary(**f) for f in folders]


@router.post("/api/folders", response_model=DocumentFolderSummary, tags=["Document Ingestion / RAG"])
async def create_folder(payload: CreateFolderRequest):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name cannot be empty.")

    factory = get_session_factory()
    async with factory() as session:
        repo = FolderRepository(session)
        existing = await repo.get_by_name(name)
        if existing:
            raise HTTPException(status_code=400, detail=f"Folder '{name}' already exists.")
        folder = await repo.create(name)
        return DocumentFolderSummary(
            id=str(folder.id),
            name=folder.name,
            document_count=0,
            created_at=to_malaysia(folder.created_at).strftime("%d/%m/%Y, %H:%M:%S") if folder.created_at else None,
        )


@router.put("/api/folders/{folder_id}", response_model=DocumentFolderSummary, tags=["Document Ingestion / RAG"])
async def update_folder(folder_id: str, payload: UpdateFolderRequest):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name cannot be empty.")

    try:
        f_uuid = UUID(folder_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid folder_id UUID.")

    factory = get_session_factory()
    async with factory() as session:
        repo = FolderRepository(session)
        updated = await repo.update(f_uuid, name)
        if not updated:
            raise HTTPException(status_code=404, detail="Folder not found.")
        all_folders = await repo.list_all()
        found = next((f for f in all_folders if f["id"] == str(f_uuid)), None)
        cnt = found["document_count"] if found else 0
        return DocumentFolderSummary(
            id=str(updated.id),
            name=updated.name,
            document_count=cnt,
            created_at=to_malaysia(updated.created_at).strftime("%d/%m/%Y, %H:%M:%S") if updated.created_at else None,
        )


@router.delete("/api/folders/{folder_id}", tags=["Document Ingestion / RAG"])
async def delete_folder(folder_id: str):
    try:
        f_uuid = UUID(folder_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid folder_id UUID.")

    factory = get_session_factory()
    async with factory() as session:
        repo = FolderRepository(session)
        success = await repo.delete(f_uuid)
        if not success:
            raise HTTPException(status_code=404, detail="Folder not found.")
        return {"status": "success", "message": "Folder deleted."}


@router.patch("/api/documents/{document_id}/folder", tags=["Document Ingestion / RAG"])
async def move_document_folder(document_id: str, payload: MoveDocumentRequest):
    try:
        d_uuid = UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document_id UUID.")

    f_uuid = None
    if payload.folder_id:
        try:
            f_uuid = UUID(payload.folder_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid folder_id UUID.")

    factory = get_session_factory()
    async with factory() as session:
        doc_repo = DocumentRepository(session)
        if f_uuid:
            folder_repo = FolderRepository(session)
            folder = await folder_repo.get_by_id(f_uuid)
            if not folder:
                raise HTTPException(status_code=404, detail="Target folder not found.")

        doc = await doc_repo.move_to_folder(d_uuid, f_uuid)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found.")
        return {
            "status": "success",
            "document_id": str(doc.id),
            "folder_id": str(doc.folder_id) if doc.folder_id else None,
            "folder_name": doc.folder_name,
        }


@router.patch("/api/documents/{document_id}/region", tags=["Document Ingestion / RAG"])
async def update_document_region(document_id: str, payload: UpdateDocumentRegionRequest):
    try:
        d_uuid = UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document_id UUID.")

    new_region = payload.region.upper().strip()
    if new_region not in ("VN", "TW", "MY", "AU", "GENERAL"):
        raise HTTPException(status_code=400, detail="Invalid region. Must be one of: VN, TW, MY, AU, GENERAL.")

    factory = get_session_factory()
    async with factory() as session:
        doc_repo = DocumentRepository(session)
        doc = await doc_repo.update_region(d_uuid, new_region)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found.")
        return {
            "status": "success",
            "document_id": str(doc.id),
            "region": doc.region,
        }


@router.post("/api/retrieval/test", tags=["Document Ingestion / RAG"])
async def test_retrieval(payload: RetrievalTestRequest):
    query_text = payload.query.strip()
    if not query_text:
        raise HTTPException(status_code=400, detail="Query text cannot be empty.")

    start_time = time.monotonic()
    query_embedding = embeddings.embed_text(query_text)
    embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"

    factory = get_session_factory()
    async with factory() as session:
        vw = float(payload.vector_weight)
        bw = float(payload.bm25_weight)
        k = max(1, min(50, payload.k))
        w_size = max(0, min(10, payload.window_size))

        intent = classify_query_intent(query_text)
        target_regions = intent["target_regions"]
        if payload.region_filter and payload.region_filter.upper() != "AUTO":
            if payload.region_filter.upper() == "ALL":
                target_regions = None
            else:
                target_regions = [payload.region_filter.upper(), "GENERAL"]

        region_clause = ""
        params = {"q": query_text, "vw": vw, "bw": bw, "k": k}
        if target_regions:
            region_clause = "AND (d.region = ANY(:target_regions) OR d.region = 'GENERAL')"
            params["target_regions"] = list(target_regions)

        sql_seed = text(f"""
            SELECT
                dp.id AS page_id,
                dp.content AS page_content,
                dp.page_number AS page_number,
                d.id AS document_id,
                d.title AS title,
                d.region AS region,
                COALESCE(os.file_url, '') AS file_url,
                (1 - (dp.embedding <=> '{embedding_str}'::vector(1536))) AS vector_similarity,
                COALESCE(ts_rank_cd(dp.tsv_content, websearch_to_tsquery('english', :q)), 0) AS bm25_rank,
                (:vw * (1 - (dp.embedding <=> '{embedding_str}'::vector(1536)))
                 + :bw * COALESCE(ts_rank_cd(dp.tsv_content, websearch_to_tsquery('english', :q)), 0)) AS combined_score
            FROM document_pages dp
            JOIN documents d ON d.id = dp.document_id
            LEFT JOIN object_storage os ON os.id = d.object_id
            WHERE dp.embedding IS NOT NULL
            {region_clause}
            ORDER BY combined_score DESC
            LIMIT :k
        """)

        res_seed = await session.execute(sql_seed, params)
        seed_hits = []
        for r in res_seed:
            seed_hits.append({
                "page_id": str(r.page_id),
                "page_content": r.page_content or "",
                "page_number": r.page_number,
                "document_id": str(r.document_id),
                "title": r.title,
                "region": getattr(r, "region", "GENERAL") or "GENERAL",
                "file_url": r.file_url,
                "vector_similarity": round(float(r.vector_similarity or 0.0), 4),
                "bm25_rank": round(float(r.bm25_rank or 0.0), 4),
                "combined_score": round(float(r.combined_score or 0.0), 4),
            })

        final_results = []
        if seed_hits:
            conditions = []
            for s in seed_hits:
                p_start = max(1, s["page_number"] - 1)
                p_end = s["page_number"] + w_size
                conditions.append(f"(dp.document_id = '{s['document_id']}' AND dp.page_number BETWEEN {p_start} AND {p_end})")

            where_clause = " OR ".join(conditions)
            sql_window = text(f"""
                SELECT
                    dp.document_id,
                    d.title,
                    COALESCE(os.file_url, '') AS file_url,
                    MIN(dp.page_number) AS page_start,
                    MAX(dp.page_number) AS page_end,
                    string_agg(dp.content, E'\n\n--- Page Break ---\n\n' ORDER BY dp.page_number) AS window_content
                FROM document_pages dp
                JOIN documents d ON d.id = dp.document_id
                LEFT JOIN object_storage os ON os.id = d.object_id
                WHERE {where_clause}
                GROUP BY dp.document_id, d.title, os.file_url
            """)
            res_win = await session.execute(sql_window)
            win_map = {str(r.document_id): (r.page_start, r.page_end, r.window_content) for r in res_win}

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

            for d_id, info in doc_seeds_map.items():
                s = info["top_seed_hit"]
                seed_pages = info["seed_pages"]
                w_info = win_map.get(d_id)
                p_start, p_end, w_content = w_info if w_info else (s["page_number"], s["page_number"], s["page_content"])
                final_results.append({
                    **s,
                    "seed_pages": seed_pages,
                    "page_number_start": p_start,
                    "page_number_end": p_end,
                    "window_content": w_content,
                })

    latency_ms = round((time.monotonic() - start_time) * 1000, 2)
    return {
        "query": query_text,
        "latency_ms": latency_ms,
        "k": k,
        "window_size": w_size,
        "vector_weight": vw,
        "bm25_weight": bw,
        "detected_region": intent["detected_region"],
        "output_lang_name": intent["output_lang_name"],
        "seed_hits_count": len(seed_hits),
        "results": final_results,
    }
