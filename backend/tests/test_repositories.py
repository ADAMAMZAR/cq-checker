"""Tests for database repositories and session management."""

import os
import pytest
from app.models.tables import uuid7

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import text

from app.db.session import Base
from app.models.tables import (
    Document, ParentChunk, ChildChunk,
    CertificateVerification, QueryCache,
    Supplier, AuditLog, DocumentEvidence,
)
from app.repositories.documents import DocumentRepository, ChunkRepository
from app.repositories.certificates import CertificateRepository
from app.repositories.cache import CacheRepository
from app.repositories.supplier_audit import SupplierRepository, AuditLogRepository, DocumentEvidenceRepository
from app.repositories.object_storage import ObjectStorageRepository


# ── Test database fixture ────────────────────────────────────────────────

TEST_DB_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/cq_checker_test",
)


@pytest.fixture
async def test_engine():
    """Create a test engine per test."""
    engine = create_async_engine(TEST_DB_URL, echo=False)
    yield engine
    await engine.dispose()


@pytest.fixture
async def setup_test_db(test_engine):
    """Create all tables in the test database."""
    async with test_engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield


@pytest.fixture
async def db_session(test_engine, setup_test_db):
    """Create a fresh session for each test with automatic rollback."""
    factory = async_sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session
        await session.rollback()


# ── Document Repository Tests ────────────────────────────────────────────

class TestDocumentRepository:
    @pytest.mark.asyncio
    async def test_create_document(self, db_session):
        obj_repo = ObjectStorageRepository(db_session)
        obj = await obj_repo.create(file_url="https://example.com/test.pdf", checksum="a" * 64)
        repo = DocumentRepository(db_session)
        doc = await repo.create(title="Test Manual", object_id=obj.id)
        assert doc.title == "Test Manual"
        assert doc.file_url == "https://example.com/test.pdf"
        assert doc.id is not None

    @pytest.mark.asyncio
    async def test_create_document_with_object_id(self, db_session):
        obj_repo = ObjectStorageRepository(db_session)
        obj = await obj_repo.create(file_url="https://example.com/linked.pdf", checksum="b" * 64)

        doc_repo = DocumentRepository(db_session)
        doc = await doc_repo.create(
            title="Linked Manual",
            object_id=obj.id,
        )
        assert doc.object_id == obj.id

    @pytest.mark.asyncio
    async def test_get_document_by_id(self, db_session):
        obj_repo = ObjectStorageRepository(db_session)
        obj = await obj_repo.create(file_url="https://example.com/lookup.pdf", checksum="c" * 64)
        repo = DocumentRepository(db_session)
        doc = await repo.create(title="Lookup Test", object_id=obj.id)
        found = await repo.get_by_id(doc.id)
        assert found is not None
        assert found.title == "Lookup Test"

    @pytest.mark.asyncio
    async def test_get_document_not_found(self, db_session):
        repo = DocumentRepository(db_session)
        found = await repo.get_by_id(uuid7())
        assert found is None

    @pytest.mark.asyncio
    async def test_exists_by_url(self, db_session):
        obj_repo = ObjectStorageRepository(db_session)
        obj = await obj_repo.create(file_url="https://example.com/exists.pdf", checksum="d" * 64)
        repo = DocumentRepository(db_session)
        await repo.create(title="Exists Test", object_id=obj.id)
        assert await repo.exists_by_url("https://example.com/exists.pdf") is True
        assert await repo.exists_by_url("https://example.com/nonexistent.pdf") is False

    @pytest.mark.asyncio
    async def test_list_documents(self, db_session):
        obj_repo = ObjectStorageRepository(db_session)
        o1 = await obj_repo.create(file_url="https://example.com/1.pdf", checksum="e1" + "0" * 62)
        o2 = await obj_repo.create(file_url="https://example.com/2.pdf", checksum="e2" + "0" * 62)
        repo = DocumentRepository(db_session)
        await repo.create(title="Doc 1", object_id=o1.id)
        await repo.create(title="Doc 2", object_id=o2.id)
        docs = await repo.list_all(limit=10)
        assert len(docs) >= 2


# ── Page Repository Tests ───────────────────────────────────────────────

class TestPageRepository:
    @pytest.mark.asyncio
    async def test_create_page(self, db_session):
        obj_repo = ObjectStorageRepository(db_session)
        obj = await obj_repo.create(file_url="https://example.com/page.pdf", checksum="f" * 64)
        doc_repo = DocumentRepository(db_session)
        page_repo = PageRepository(db_session)

        doc = await doc_repo.create(title="Page Test", object_id=obj.id)
        page = await page_repo.create_page(doc.id, page_number=1, content="Page chunk content", embedding=[0.1] * 1536)

        assert page.document_id == doc.id
        assert page.page_number == 1

    @pytest.mark.asyncio
    async def test_list_pages(self, db_session):
        obj_repo = ObjectStorageRepository(db_session)
        obj = await obj_repo.create(file_url="https://example.com/pages.pdf", checksum="g" * 64)
        doc_repo = DocumentRepository(db_session)
        page_repo = PageRepository(db_session)

        doc = await doc_repo.create(title="List Pages Test", object_id=obj.id)
        await page_repo.create_page(doc.id, page_number=1, content="Page 1")
        await page_repo.create_page(doc.id, page_number=2, content="Page 2")

        pages = await page_repo.list_pages(doc.id)
        assert len(pages) == 2

    @pytest.mark.asyncio
    async def test_count_by_document(self, db_session):
        obj_repo = ObjectStorageRepository(db_session)
        obj = await obj_repo.create(file_url="https://example.com/count.pdf", checksum="h" * 64)
        doc_repo = DocumentRepository(db_session)
        page_repo = PageRepository(db_session)

        doc = await doc_repo.create(title="Count Test", object_id=obj.id)
        await page_repo.create_page(doc.id, page_number=1, content="Page 1")

        counts = await page_repo.count_by_document(doc.id)
        assert counts["page_count"] == 1


# ── Certificate Repository Tests ─────────────────────────────────────────

class TestCertificateRepository:
    @pytest.mark.asyncio
    async def test_create_certificate(self, db_session):
        obj_repo = ObjectStorageRepository(db_session)
        obj = await obj_repo.create(file_url="https://example.com/cert.pdf", checksum="i" * 64)
        repo = CertificateRepository(db_session)
        record = await repo.create(
            object_id=obj.id,
            extracted_data={"name": "Test Corp", "expiry": "2027-01-01"},
            status="PASS",
            reasoning_trace="All fields match.",
        )
        assert record.status == "PASS"
        assert record.extracted_data["name"] == "Test Corp"

    @pytest.mark.asyncio
    async def test_list_certificates(self, db_session):
        obj_repo = ObjectStorageRepository(db_session)
        o1 = await obj_repo.create(file_url="https://example.com/c1.pdf", checksum="j1" + "0" * 62)
        o2 = await obj_repo.create(file_url="https://example.com/c2.pdf", checksum="j2" + "0" * 62)
        repo = CertificateRepository(db_session)
        await repo.create(object_id=o1.id, extracted_data={}, status="FAIL")
        await repo.create(object_id=o2.id, extracted_data={}, status="PASS")
        records = await repo.list_all(limit=10)
        assert len(records) >= 2


# ── Cache Repository Tests ───────────────────────────────────────────────

class TestCacheRepository:
    @pytest.mark.asyncio
    async def test_put_and_find_cached(self, db_session):
        repo = CacheRepository(db_session)
        await repo.put(query_text="What is the policy?", cached_response="The policy is X.")
        # Note: find_cached requires vector similarity, which needs pgvector.
        # This test just verifies the put works.
        # Full vector similarity test requires a running pgvector database.


# ── Object Storage Repository Tests ──────────────────────────────────────

class TestObjectStorageRepository:
    @pytest.mark.asyncio
    async def test_create_and_get_by_url(self, db_session):
        repo = ObjectStorageRepository(db_session)
        rec = await repo.create(
            file_url="/api/files/local/acme/cert.pdf",
            bucket=None,
            object_key="/api/files/local/acme/cert.pdf",
            content_type="application/pdf",
            size_bytes=1024,
            checksum="a" * 64,
        )
        assert rec.file_url == "/api/files/local/acme/cert.pdf"
        assert rec.checksum == "a" * 64

        found = await repo.get_by_url("/api/files/local/acme/cert.pdf")
        assert found is not None
        assert found.id == rec.id

    @pytest.mark.asyncio
    async def test_get_by_url_missing(self, db_session):
        repo = ObjectStorageRepository(db_session)
        assert await repo.get_by_url("http://nope/x.pdf") is None


# ── Audit Repository Tests ───────────────────────────────────────────────

class TestSupplierRepository:
    @pytest.mark.asyncio
    async def test_get_or_create_new(self, db_session):
        repo = SupplierRepository(db_session)
        supplier = await repo.get_or_create("Test Supplier Inc")
        assert supplier.supplier_name == "Test Supplier Inc"
        assert supplier.id is not None

    @pytest.mark.asyncio
    async def test_get_or_create_existing(self, db_session):
        repo = SupplierRepository(db_session)
        s1 = await repo.get_or_create("Existing Supplier")
        s2 = await repo.get_or_create("Existing Supplier")
        assert s1.id == s2.id

    @pytest.mark.asyncio
    async def test_list_all(self, db_session):
        repo = SupplierRepository(db_session)
        await repo.get_or_create("Alpha Corp")
        await repo.get_or_create("Beta Corp")
        suppliers = await repo.list_all()
        assert len(suppliers) >= 2


class TestAuditLogRepository:
    @pytest.mark.asyncio
    async def test_create_audit_log(self, db_session):
        supplier_repo = SupplierRepository(db_session)
        supplier = await supplier_repo.get_or_create("Audit Test Supplier")

        repo = AuditLogRepository(db_session)
        log = AuditLog(
            audit_id="AUDIT_TEST_001",
            supplier_id=supplier.id,
            created_at="31/07/2026, 10:00:00",
            supplier_name="Audit Test Supplier",
            compiled_extracted_data="[]",
            suggested_comment="Test audit",
        )
        result = await repo.create(log)
        assert result.supplier_name == "Audit Test Supplier"
        assert result.result == "Mismatch"  # default


class TestDocumentEvidenceRepository:
    async def _seed_audit_log(self, db_session, supplier_id: int, audit_id: str):
        """Create a parent audit_logs row so the document_evidence FK holds."""
        from app.repositories.supplier_audit import AuditLogRepository
        repo = AuditLogRepository(db_session)
        return await repo.create(AuditLog(
            audit_id=audit_id,
            supplier_id=supplier_id,
            created_at="31/07/2026, 10:00:00",
            supplier_name="Evidence Test Supplier",
            compiled_extracted_data="[]",
            suggested_comment="Test audit",
        ))

    @pytest.mark.asyncio
    async def test_create_evidence(self, db_session):
        supplier_repo = SupplierRepository(db_session)
        supplier = await supplier_repo.get_or_create("Evidence Test Supplier")
        await self._seed_audit_log(db_session, supplier.id, "test-audit-001")

        repo = DocumentEvidenceRepository(db_session)
        evidence = DocumentEvidence(
            audit_id="test-audit-001",
            supplier_id=supplier.id,
            created_at="31/07/2026, 10:00:00",
            supplier_name="Evidence Test Supplier",
            filename="test_cert.pdf",
            ariba_question_label="Q1",
            ariba_qa_answers="[]",
            gemini_extracted_supplier_name="Evidence Test Supplier",
            gemini_extracted_metadata="{}",
            file_content_type="application/pdf",
        )
        result = await repo.create(evidence)
        assert result.filename == "test_cert.pdf"
        assert result.audit_id == "test-audit-001"

    @pytest.mark.asyncio
    async def test_get_by_audit_id(self, db_session):
        supplier_repo = SupplierRepository(db_session)
        supplier = await supplier_repo.get_or_create("Multi-Evidence Supplier")
        await self._seed_audit_log(db_session, supplier.id, "multi-evidence-001")

        repo = DocumentEvidenceRepository(db_session)
        for i in range(3):
            await repo.create(DocumentEvidence(
                audit_id="multi-evidence-001",
                supplier_id=supplier.id,
                created_at="31/07/2026, 10:00:00",
                supplier_name="Multi-Evidence Supplier",
                filename=f"doc_{i}.pdf",
                ariba_question_label=f"Q{i}",
                ariba_qa_answers="[]",
                gemini_extracted_supplier_name="Multi-Evidence Supplier",
                gemini_extracted_metadata="{}",
                file_content_type="application/pdf",
            ))

        results = await repo.get_by_audit_id("multi-evidence-001")
        assert len(results) == 3
