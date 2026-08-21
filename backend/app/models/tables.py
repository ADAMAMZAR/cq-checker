"""SQLAlchemy ORM models for Neon PostgreSQL + pgvector."""

import os
import time
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    String,
    Text,
    Integer,
    Numeric,
    DateTime,
    Boolean,
    ForeignKey,
    Computed,
    CheckConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, TSVECTOR
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector

from app.db.session import Base


def uuid7() -> uuid.UUID:
    """Generate a UUIDv7 (RFC 9562).

    Uses native `uuid.uuid7()` on Python 3.14+, or pure-Python fallback on older versions.
    """
    if hasattr(uuid, "uuid7"):
        return uuid.uuid7()  # type: ignore[attr-defined]

    ms = int(time.time() * 1000)
    rand_bytes = os.urandom(10)

    time_high = (ms >> 16) & 0xFFFFFFFF
    time_low = ms & 0xFFFF

    rand_a = int.from_bytes(rand_bytes[:2], "big") & 0x0FFF
    ver_and_rand_a = 0x7000 | rand_a

    rand_b = int.from_bytes(rand_bytes[2:], "big") & 0x3FFFFFFFFFFFFFFF
    var_and_rand_b = 0x8000000000000000 | rand_b

    uuid_int = (time_high << 96) | (time_low << 80) | (ver_and_rand_a << 64) | var_and_rand_b
    return uuid.UUID(int=uuid_int)


_new_uuid = uuid7


# ── Document Ingestion & RAG ────────────────────────────────────────────────

class DocumentFolder(Base):
    __tablename__ = "document_folders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    name = Column(String(255), nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    documents = relationship("Document", back_populates="folder")


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    object_id = Column(UUID(as_uuid=True), ForeignKey("object_storage.id", ondelete="SET NULL"), nullable=True, index=True)
    folder_id = Column(UUID(as_uuid=True), ForeignKey("document_folders.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    region = Column(String(20), nullable=False, default="GENERAL", index=True)
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    cost_usd = Column(Numeric(12, 6), nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    object_storage = relationship("ObjectStorage")
    folder = relationship("DocumentFolder", back_populates="documents")
    pages = relationship("DocumentPage", back_populates="document", cascade="all, delete-orphan")

    @property
    def file_url(self) -> str:
        return self.object_storage.file_url if self.object_storage else ""

    @property
    def file_hash(self) -> Optional[str]:
        return self.object_storage.checksum if self.object_storage else None

    @property
    def folder_name(self) -> Optional[str]:
        return self.folder.name if self.folder else "General"


class DocumentPage(Base):
    __tablename__ = "document_pages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    page_number = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(1536), nullable=True)
    tsv_content = Column(
        "tsv_content",
        TSVECTOR,
        Computed("to_tsvector('english', content)"),
        nullable=False,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    document = relationship("Document", back_populates="pages")

    __table_args__ = (
        CheckConstraint("page_number > 0", name="chk_document_pages_page_number"),
    )


# ── Certificate Verification ─────────────────────────────────────────────────

class CertificateVerification(Base):
    __tablename__ = "certificate_verifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    object_id = Column(UUID(as_uuid=True), ForeignKey("object_storage.id", ondelete="SET NULL"), nullable=True, index=True)
    extracted_data = Column(JSONB, nullable=False)
    status = Column(String(50), nullable=False)  # PASS, FAIL, REQUIRES_HUMAN_REVIEW
    reasoning_trace = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    object_storage = relationship("ObjectStorage")

    @property
    def file_url(self) -> str:
        return self.object_storage.file_url if self.object_storage else ""

    @property
    def file_hash(self) -> Optional[str]:
        return self.object_storage.checksum if self.object_storage else None

    __table_args__ = (
        CheckConstraint(
            "status IN ('PASS', 'FAIL', 'REQUIRES_HUMAN_REVIEW')",
            name="chk_certificate_verifications_status",
        ),
    )


# ── Semantic Query Cache ─────────────────────────────────────────────────────

class QueryCache(Base):
    __tablename__ = "query_cache"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    query_text = Column(Text, nullable=False)
    query_embedding = Column(Vector(1536), nullable=True)
    cached_response = Column(Text, nullable=False)
    hit_count = Column(Integer, nullable=False, default=0)
    last_hit_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ── Chat: sessions, messages, cost logs ──────────────────────────────────────


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    email = Column(String(255), nullable=False, unique=True, index=True)
    display_name = Column(String(255), nullable=True)
    role = Column(String(50), nullable=False, default="employee")
    sso_subject = Column(String(255), nullable=True, unique=True, index=True)
    sso_provider = Column(String(50), nullable=True, default="entra")
    sso_tenant_id = Column(String(100), nullable=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    roles = relationship("Role", secondary="user_roles", lazy="selectin")


class AuthEvent(Base):
    __tablename__ = "auth_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    event_type = Column(String(50), nullable=False)  # login_success, login_failure, logout, impersonate_start, impersonate_stop
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    details = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Role(Base):
    __tablename__ = "roles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    name = Column(String(50), unique=True, nullable=False)
    display_name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)

    features = relationship("Feature", secondary="role_features", lazy="selectin")


class UserRole(Base):
    __tablename__ = "user_roles"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    granted_at = Column(DateTime(timezone=True), server_default=func.now())


class Feature(Base):
    __tablename__ = "features"

    id = Column(String(50), primary_key=True)
    display_name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    route_path = Column(String(200), nullable=True)
    is_external = Column(String(1), nullable=False, default="0")  # SQLite compat for boolean
    sort_order = Column(Integer, nullable=False, default=0)


class RoleFeature(Base):
    __tablename__ = "role_features"

    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    feature_id = Column(String(50), ForeignKey("features.id", ondelete="CASCADE"), primary_key=True)


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    session_id = Column(String(100), nullable=False, unique=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    session_id = Column(String(100), ForeignKey("chat_sessions.session_id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False)  # "user" | "assistant"
    content = Column(Text, nullable=False)
    sources = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint("role IN ('user', 'assistant')", name="chk_chat_messages_role"),
    )


class ChatFeedback(Base):
    __tablename__ = "chat_feedback"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    message_id = Column(UUID(as_uuid=True), ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(String(100), nullable=False, index=True)
    rating = Column(String(20), nullable=False)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    message = relationship("ChatMessage")

    __table_args__ = (
        CheckConstraint("rating IN ('satisfied', 'not_satisfied')", name="chk_chat_feedback_rating"),
    )


class ChatLog(Base):
    __tablename__ = "chat_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    query_text = Column(Text, nullable=False)
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    cost_usd = Column(Numeric(12, 6), nullable=False, default=0)
    cache_hit = Column(Integer, nullable=False, default=0)  # 0/1
    cached_query_id = Column(UUID(as_uuid=True), ForeignKey("query_cache.id", ondelete="SET NULL"), nullable=True, index=True)
    cached_query_text = Column(Text, nullable=True)
    latency_ms = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    cached_query = relationship("QueryCache")


# ── Object Storage Metadata (Phase 8 GCS migration readiness) ────────────────

class ObjectStorage(Base):
    __tablename__ = "object_storage"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    file_url = Column(Text, nullable=False, unique=True, index=True)
    bucket = Column(String(255), nullable=True)
    object_key = Column(Text, nullable=True)
    content_type = Column(String(100), nullable=True)
    size_bytes = Column(Integer, nullable=True)
    checksum = Column(String(64), nullable=True)  # SHA-256
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ── Legacy Audit Tables (ported from Sheets/Supabase) ────────────────────────

class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    supplier_name = Column(String(255), nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    audit_logs = relationship("AuditLog", back_populates="supplier", cascade="all, delete-orphan")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    audit_id = Column(String(100), nullable=False, unique=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    supplier_name = Column(String(255), nullable=False)
    workspace_title = Column(String(255), nullable=True, default="Ariba Workspace")
    complete_qa_data_dump = Column(Text, nullable=True, default="[]")
    compiled_extracted_data = Column(Text, nullable=False)
    result = Column(String(50), nullable=True, default="Mismatch")
    suggested_comment = Column(Text, nullable=False)
    screenshot_url = Column(Text, nullable=True)
    comparison_input_tokens = Column(Integer, nullable=False, default=0)
    comparison_output_tokens = Column(Integer, nullable=False, default=0)
    comparison_cost_usd = Column(Numeric(12, 6), nullable=False, default=0)
    total_run_cost_usd = Column(Numeric(12, 6), nullable=False, default=0)
    comparison_table = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    supplier = relationship("Supplier", back_populates="audit_logs")

    __table_args__ = (
        CheckConstraint("result IN ('Match', 'Mismatch')", name="chk_audit_logs_result"),
    )


class DocumentEvidence(Base):
    __tablename__ = "document_evidence"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_new_uuid)
    object_id = Column(UUID(as_uuid=True), ForeignKey("object_storage.id", ondelete="SET NULL"), nullable=True, index=True)
    audit_id = Column(String(100), ForeignKey("audit_logs.audit_id", ondelete="CASCADE"), nullable=False, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    supplier_name = Column(String(255), nullable=False)
    filename = Column(String(500), nullable=False)
    ariba_question_label = Column(String(500), nullable=False)
    ariba_qa_answers = Column(Text, nullable=False)
    gemini_extracted_supplier_name = Column(Text, nullable=False)
    gemini_extracted_metadata = Column(Text, nullable=False)
    file_content_type = Column(String(100), nullable=False)
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    cost_usd = Column(Numeric(12, 6), nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    object_storage = relationship("ObjectStorage")
    supplier = relationship("Supplier")

    @property
    def file_url(self) -> str:
        return self.object_storage.file_url if self.object_storage else ""

    @property
    def file_hash(self) -> Optional[str]:
        return self.object_storage.checksum if self.object_storage else None




