"""SQLAlchemy ORM models for Neon PostgreSQL + pgvector."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    String,
    Text,
    Integer,
    DateTime,
    ForeignKey,
    Computed,
    func,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, TSVECTOR
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector

from app.db.session import Base


# ── Document Ingestion & RAG ────────────────────────────────────────────────

class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), nullable=False)
    file_url = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    parent_chunks = relationship("ParentChunk", back_populates="document", cascade="all, delete-orphan")


class ParentChunk(Base):
    __tablename__ = "parent_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    page_number = Column(Integer, nullable=True)

    document = relationship("Document", back_populates="parent_chunks")
    child_chunks = relationship("ChildChunk", back_populates="parent", cascade="all, delete-orphan")


class ChildChunk(Base):
    __tablename__ = "child_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("parent_chunks.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(1536), nullable=True)
    tsv_content = Column(
        "tsv_content",
        TSVECTOR,
        Computed("to_tsvector('english', content)"),
        nullable=False,
    )

    parent = relationship("ParentChunk", back_populates="child_chunks")


# ── Certificate Verification ─────────────────────────────────────────────────

class CertificateVerification(Base):
    __tablename__ = "certificate_verifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    file_url = Column(Text, nullable=False)
    extracted_data = Column(JSONB, nullable=False)
    status = Column(String(50), nullable=False)  # PASS, FAIL, REQUIRES_HUMAN_REVIEW
    judge_reasoning = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ── Semantic Query Cache ─────────────────────────────────────────────────────

class QueryCache(Base):
    __tablename__ = "query_cache"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    query_text = Column(Text, nullable=False)
    query_embedding = Column(Vector(1536), nullable=True)
    cached_response = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ── Legacy Audit Tables (ported from Sheets/Supabase) ────────────────────────

class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    supplier_name = Column(String(255), nullable=False, unique=True)
    date_added = Column(DateTime(timezone=True), server_default=func.now())

    audit_logs = relationship("AuditLog", back_populates="supplier", cascade="all, delete-orphan")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    audit_id = Column(String(100), nullable=False, unique=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    timestamp = Column(String(50), nullable=False)
    supplier_name = Column(String(255), nullable=False)
    workspace_title = Column(String(255), nullable=True, default="Ariba Workspace")
    cert_type = Column(String(100), nullable=True, default="Relational evidence")
    complete_qa_data_dump = Column(Text, nullable=True, default="[]")
    compiled_extracted_data = Column(Text, nullable=False)
    result = Column(String(50), nullable=True, default="Mismatch")
    expiration_date = Column(String(50), nullable=True, default="N/A")
    suggested_comment = Column(Text, nullable=False)
    screenshot_url = Column(Text, nullable=True)
    comparison_input_tokens = Column(Integer, nullable=False, default=0)
    comparison_output_tokens = Column(Integer, nullable=False, default=0)
    comparison_cost_usd = Column(Integer, nullable=False, default=0)  # stored as scaled integer or float
    total_run_cost_usd = Column(Integer, nullable=False, default=0)
    comparison_table = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    supplier = relationship("Supplier", back_populates="audit_logs")


class DocumentEvidence(Base):
    __tablename__ = "document_evidence"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    audit_id = Column(String(100), nullable=False, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    timestamp = Column(String(50), nullable=False)
    supplier_name = Column(String(255), nullable=False)
    filename = Column(String(500), nullable=False)
    ariba_question_label = Column(String(500), nullable=False)
    ariba_qa_answers = Column(Text, nullable=False)
    gemini_extracted_supplier_name = Column(Text, nullable=False)
    gemini_extracted_metadata = Column(Text, nullable=False)
    file_content_type = Column(String(100), nullable=False)
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    cost_usd = Column(Integer, nullable=False, default=0)
    file_hash = Column(String(64), nullable=True)
    file_url = Column(Text, nullable=True)
