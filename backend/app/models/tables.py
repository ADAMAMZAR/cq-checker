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
    route_path = Column(Text, nullable=True)
    is_external = Column(String(1), nullable=False, default="0")  # SQLite compat for boolean
    sort_order = Column(Integer, nullable=False, default=0)


class RoleFeature(Base):
    __tablename__ = "role_features"

    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    feature_id = Column(String(50), ForeignKey("features.id", ondelete="CASCADE"), primary_key=True)