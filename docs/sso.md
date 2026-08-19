# CQ Checker — SSO Implementation Plan

**Status:** Plan ready. Implementation blocked on Entra ID app registration (Tenant ID + Client ID + Client Secret).
**Last updated:** 2026-08-19

---

## Context

CQ Checker needs Single Sign-On so employees log in with their corporate Microsoft Entra ID credentials instead of a separate password. This is for **internal use first** (single-tenant), with the same architecture extensible to external customers later.

### Why Microsoft Entra ID

The company uses Google Workspace for email/docs/calendar but **kept Microsoft Entra ID as the identity provider** for SSO (used to log in to SAP and other corporate systems). This is a common "dual-stack" setup. ~30% of enterprises run this combo.

The OIDC integration is with **Microsoft Entra ID**, not Google. The Google Workspace migration is irrelevant for SSO.

### Target architecture

```
┌─────────────────────────────────────────────────┐
│         app.yourcompany.com (GCP)                │
│  ┌──────────────────┐   ┌────────────────────┐  │
│  │ Next.js 16 (UI)  │   │  FastAPI (API)     │  │
│  │  Path: /         │   │  Path: /api/*      │  │
│  └────────┬─────────┘   └─────────┬──────────┘  │
│           │                       │             │
│           └────── Session cookie ─┘             │
│                  (HttpOnly, SameSite=Lax)       │
└────────────────────────┬────────────────────────┘
                         │ OIDC
                         ▼
              ┌──────────────────────┐
              │ Microsoft Entra ID   │
              │ (single tenant)      │
              └──────────────────────┘
```

### Decisions (locked in)

| Topic | Choice |
|---|---|
| IdP | Microsoft Entra ID (single-tenant) |
| Protocol | OIDC — Authorization Code + PKCE |
| Role model | Additive RBAC — everyone has `base`, plus optional extras (`admin`, `reviewer`, `auditor`) |
| Cookie scope | Same domain (`app.yourcompany.com`), single SessionMiddleware |
| Impersonation | Yes — admins can impersonate non-admin users with full audit trail |
| Hosting | GCP (frontend + backend, same domain) |
| Existing data | Empty `users` table, no users yet — greenfield auth |

---

## Phased implementation roadmap

| # | Phase | Effort | Blocker? |
|---|---|---|---|
| 0 | Entra ID app registration (Azure Portal) | 20 min | **You do this manually** |
| 1 | Backend foundation (OIDC client, routes, session) | 1.5 hr | After Phase 0 |
| 2 | JIT provisioning + role sync | 45 min | After Phase 1 |
| 2.5 | Impersonation flow | 1 hr | After Phase 2 |
| 3 | RBAC enforcement (`require_role`) | 30 min | After Phase 2 |
| 4 | Frontend (login page, protected layout) | 1.5 hr | Can run parallel to backend |
| 4.5 | Impersonation UI (banner + modal) | 30 min | After Phase 2.5 |
| 5 | Environment variables | 15 min | Anytime |
| 6 | Logging + observability | 30 min | After Phase 2 |
| 7 | Tests (unit + integration + E2E) | 2 hr | After Phase 4 |
| 8 | Production deployment | 1 hr | After Phase 7 |

**Total:** ~9.5 hours of implementation work.

---

## Phase 0 — Entra ID app registration

**You do this manually in Azure Portal.** About 20 minutes.

### Steps

1. Go to [Azure Portal → Entra ID → App registrations](https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/RegisteredApps) → **New registration**
2. **Name:** `cq-checker-internal`
3. **Supported account types:** **"Accounts in this organizational directory only (Single tenant)"**
4. **Redirect URI:**
   - Type: Web
   - URI: `http://localhost:8000/auth/callback` (add prod URL after deploy)
5. Click **Register**
6. Note down from the Overview page:
   - **Application (client) ID** → `ENTRA_CLIENT_ID`
   - **Directory (tenant) ID** → `ENTRA_TENANT_ID`
7. **Certificates & secrets** → **New client secret** → copy value immediately (only shown once) → `ENTRA_CLIENT_SECRET`
8. **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions**:
   - `openid`
   - `profile`
   - `email`
   - `User.Read`
   - `GroupMember.Read.All` (for groups claim)
9. Click **Grant admin consent for [your org]** (green checkmark appears)
10. **Token configuration** → **Add optional claim**:
    - Token type: **ID**
    - Claim: `email`, `family_name`, `given_name`, `upn`, `groups`
    - For `groups`: choose **"Group IDs"** (smaller payload) — note these IDs for the role mapping
11. After deploy: come back and add the prod redirect URI: `https://app.yourcompany.com/auth/callback`

### What you should have when done

```
ENTRA_TENANT_ID=11111111-2222-3333-4444-555555555555
ENTRA_CLIENT_ID=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
ENTRA_CLIENT_SECRET=<secret-value>
```

Also note the **Object IDs** of any Entra security groups you want to map to roles (e.g., the "CQ Checker Admins" group → admin role).

---

## Phase 1 — Backend foundation

### 1.1 Dependencies

Add to `backend/requirements.txt`:

```
# ── SSO (Microsoft Entra ID) ────────────────────────────────
authlib>=1.3.2
itsdangerous>=2.2.0
```

Then:
```bash
cd backend
pip install -r requirements.txt
```

### 1.2 Files to create

```
backend/app/auth/
├── __init__.py
├── config.py            # Pydantic settings + role mapping
├── oauth.py             # Authlib client setup
├── routes.py            # /auth/login, /auth/callback, /auth/logout, /auth/me
├── session.py # Server session helpers
└── jwt_utils.py         # Manual JWT verification for tests
```

### 1.3 `backend/app/auth/config.py`

```python
"""SSO configuration loaded from environment."""
from pydantic_settings import BaseSettings


class SSOSettings(BaseSettings):
    # Entra ID
    ENTRA_TENANT_ID: str
    ENTRA_CLIENT_ID: str
    ENTRA_CLIENT_SECRET: str
    ENTRA_REDIRECT_URI: str = "http://localhost:8000/auth/callback"

    # Discovery URL (computed)
    @property
    def ENTRA_DISCOVERY_URL(self) -> str:
        return (
            f"https://login.microsoftonline.com/{self.ENTRA_TENANT_ID}"
            "/v2.0/.well-known/openid-configuration"
        )

    # Session
    SESSION_SECRET: str
    SESSION_COOKIE_NAME: str = "cq_session"
    SESSION_MAX_AGE_SECONDS: int = 8 * 60 * 60  # 8 hours

    # Role mapping: Entra group Object ID -> app role name
    ROLE_GROUP_ADMIN: str | None = None
    ROLE_GROUP_REVIEWER: str | None = None
    ROLE_GROUP_AUDITOR: str | None = None

    def role_mapping(self) -> dict[str, str]:
        mapping = {}
        if self.ROLE_GROUP_ADMIN:
            mapping[self.ROLE_GROUP_ADMIN] = "admin"
        if self.ROLE_GROUP_REVIEWER:
            mapping[self.ROLE_GROUP_REVIEWER] = "reviewer"
        if self.ROLE_GROUP_AUDITOR:
            mapping[self.ROLE_GROUP_AUDITOR] = "auditor"
        return mapping

    # Impersonation
    ALLOW_IMPERSONATION: bool = True
    IMPERSONATION_FORBIDDEN_PATHS: list[str] = [
        "/users/*/delete",
        "/users/*/roles",
        "/config/*",
        "/admin/users",
    ]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = SSOSettings()
```

### 1.4 `backend/app/auth/oauth.py`

```python
"""Authlib OAuth client configured for Microsoft Entra ID."""
from authlib.integrations.starlette_client import OAuth

from app.auth.config import settings

oauth = OAuth()

oauth.register(
    name="entra",
    server_metadata_url=settings.ENTRA_DISCOVERY_URL,
    client_id=settings.ENTRA_CLIENT_ID,
    client_secret=settings.ENTRA_CLIENT_SECRET,
    client_kwargs={
        "scope": "openid email profile",
        # PKCE is enabled by default in Authlib for confidential clients
    },
)
```

### 1.5 `backend/app/auth/routes.py`

```python
"""Authentication routes: login, callback, logout, me."""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse

from app.auth.config import settings
from app.auth.oauth import oauth

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/login")
async def login(request: Request):
    """Redirect user to Microsoft Entra login."""
    redirect_uri = settings.ENTRA_REDIRECT_URI
    return await oauth.entra.authorize_redirect(request, redirect_uri)


@router.get("/callback")
async def callback(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle the OIDC callback from Microsoft Entra."""
    try:
        token = await oauth.entra.authorize_access_token(request)
        claims = token["userinfo"]  # JWT claims, already verified by Authlib
    except Exception as e:
        raise HTTPException(400, f"OIDC callback failed: {e}")

    user = await get_or_create_user(claims, db)

    # Create session
    request.session["user_id"] = str(user.id)
    request.session["email"] = user.email

    return RedirectResponse(url="/")


@router.post("/logout")
async def logout(request: Request):
    """Clear local session AND redirect to Entra for full logout."""
    request.session.clear()
    end_session_url = (
        f"https://login.microsoftonline.com/{settings.ENTRA_TENANT_ID}"
        "/oauth2/v2.0/logout"
        f"?post_logout_redirect_uri={settings.ENTRA_REDIRECT_URI.rsplit('/auth/callback', 1)[0]}"
    )
    return RedirectResponse(url=end_session_url)


@router.get("/me")
async def me(request: Request, db: AsyncSession = Depends(get_db)):
    """Return current user info + roles."""
    user = await get_current_user_from_session(request, db)
    if not user:
        raise HTTPException(401, "Not authenticated")
    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "roles": [r.name for r in user.roles],
        "is_impersonating": request.session.get("is_impersonating", False),
    }
```

### 1.6 Wire up in `backend/app/main.py`

Add to the existing `main.py`:

```python
from starlette.middleware.sessions import SessionMiddleware
from app.auth.config import settings
from app.auth.routes import router as auth_router

# In app creation:
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SESSION_SECRET,
    session_cookie=settings.SESSION_COOKIE_NAME,
    max_age=settings.SESSION_MAX_AGE_SECONDS,
    same_site="lax",
    https_only=False,  # True in production
)

app.include_router(auth_router, prefix="/auth")
```

---

## Phase 2 — Database migration + JIT provisioning

### 2.1 Alembic migration

Create `backend/migrations/versions/m4n5o6p7q8r9_sso_and_rbac.py`:

```python
"""SSO + RBAC: sso columns, roles, user_roles."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "m4n5o6p7q8r9"
down_revision = "c3d4e5f6a7b8"  # last existing migration


def upgrade():
    # ── Drop old single role column, replace with RBAC ──────────
    op.drop_column("users", "role")

    # ── Add SSO columns to users ────────────────────────────────
    op.add_column("users", sa.Column("sso_subject", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("sso_provider", sa.String(50), nullable=True))
    op.add_column("users", sa.Column("sso_tenant_id", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()))
    op.create_index("ix_users_sso_subject", "users", ["sso_subject"], unique=True)

    # ── Roles table ─────────────────────────────────────────────
    op.create_table(
        "roles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(50), unique=True, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
    )

    # ── Seed default roles ──────────────────────────────────────
    op.execute("""
        INSERT INTO roles (name, description) VALUES
            ('base',     'Default access for all authenticated users'),
            ('admin',    'Full access to all resources'),
            ('reviewer', 'Can review documents'),
            ('auditor',  'Can view audit logs and reports')
    """)

    # ── User-Roles join table ───────────────────────────────────
    op.create_table(
        "user_roles",
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role_id", UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("granted_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── Auth events table ───────────────────────────────────────
    op.create_table(
        "auth_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("actor_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text, nullable=True),
        sa.Column("details", sa.dialects.postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_auth_events_user_id", "auth_events", ["user_id"])
    op.create_index("ix_auth_events_created_at", "auth_events", ["created_at"])


def downgrade():
    op.drop_index("ix_auth_events_created_at", table_name="auth_events")
    op.drop_index("ix_auth_events_user_id", table_name="auth_events")
    op.drop_table("auth_events")
    op.drop_table("user_roles")
    op.drop_table("roles")
    op.drop_index("ix_users_sso_subject", table_name="users")
    op.drop_column("users", "is_active")
    op.drop_column("users", "last_login_at")
    op.drop_column("users", "sso_tenant_id")
    op.drop_column("users", "sso_provider")
    op.drop_column("users", "sso_subject")
    op.add_column("users", sa.Column("role", sa.String(50), nullable=False, server_default="employee"))
```

### 2.2 Update SQLAlchemy models in `backend/app/models/tables.py`

```python
class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid7)
    email = Column(String(255), nullable=False, unique=True, index=True)
    display_name = Column(String(255), nullable=True)
    sso_subject = Column(String(255), nullable=True, unique=True, index=True)
    sso_provider = Column(String(50), nullable=True)
    sso_tenant_id = Column(String(100), nullable=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    roles = relationship("Role", secondary="user_roles", lazy="selectin")
    chat_sessions = relationship("ChatSession", back_populates="user")


class Role(Base):
    __tablename__ = "roles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid7)
    name = Column(String(50), unique=True, nullable=False)
    description = Column(Text, nullable=True)


class UserRole(Base):
    __tablename__ = "user_roles"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    granted_at = Column(DateTime(timezone=True), server_default=func.now())


class AuthEvent(Base):
    __tablename__ = "auth_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid7)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    event_type = Column(String(50), nullable=False)  # login_success, login_failure, logout, impersonate_start, impersonate_stop
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    details = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

### 2.3 Migration for audit_logs (impersonation column)

Create `backend/migrations/versions/n5o6p7q8r9s0_impersonation_audit_columns.py`:

```python
"""Add actor_user_id to audit_logs for impersonation tracking."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "n5o6p7q8r9s0"
down_revision = "m4n5o6p7q8r9"


def upgrade():
    op.add_column(
        "audit_logs",
        sa.Column("actor_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_audit_logs_actor_user_id", "audit_logs", ["actor_user_id"])


def downgrade():
    op.drop_index("ix_audit_logs_actor_user_id", table_name="audit_logs")
    op.drop_column("audit_logs", "actor_user_id")
```

Run:
```bash
cd backend
alembic upgrade head
```

### 2.4 `backend/app/auth/provisioning.py`

```python
"""JIT user provisioning + role sync from Entra claims."""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.config import settings
from app.models.tables import Role, User, UserRole


async def get_or_create_user(claims: dict, db: AsyncSession) -> User:
    sso_subject = claims["oid"]
    tenant_id = claims["tid"]

    # CRITICAL: reject tokens from other tenants
    if tenant_id != settings.ENTRA_TENANT_ID:
        raise SecurityError(f"Token from unexpected tenant: {tenant_id}")

    user = await db.scalar(select(User).where(User.sso_subject == sso_subject))

    if not user:
        user = User(
            sso_subject=sso_subject,
            sso_provider="entra",
            sso_tenant_id=tenant_id,
            email=claims["email"],
            display_name=claims.get("name"),
            is_active=True,
        )
        db.add(user)
        await db.flush()

        # Auto-grant base role
        base_role = await db.scalar(select(Role).where(Role.name == "base"))
        db.add(UserRole(user_id=user.id, role_id=base_role.id))

    user.last_login_at = datetime.now(timezone.utc)
    await sync_roles_from_groups(user, claims.get("groups", []), db)
    await db.commit()
    return user


async def sync_roles_from_groups(user: User, entra_group_ids: list[str], db: AsyncSession):
    """Map Entra groups to app roles. Full sync, not additive."""
    mapping = settings.role_mapping()
    desired_role_names = {"base"}  # everyone gets base
    for gid in entra_group_ids:
        if gid in mapping:
            desired_role_names.add(mapping[gid])

    # Fetch all Role rows
    all_roles = (await db.execute(select(Role))).scalars().all()
    desired_roles = [r for r in all_roles if r.name in desired_role_names]
    desired_role_ids = {r.id for r in desired_roles}

    # Current user role IDs
    current_role_ids = {r.id for r in user.roles}

    # Remove roles no longer present (skip 'base' — never remove base)
    for role in list(user.roles):
        if role.name == "base":
            continue
        if role.id not in desired_role_ids:
            user.roles.remove(role)

    # Add new roles
    for role in desired_roles:
        if role.id not in current_role_ids:
            user.roles.append(role)


class SecurityError(Exception):
    pass
```

---

## Phase 2.5 — Impersonation

### `backend/app/auth/impersonation.py`

```python
"""Admin impersonation flow with full audit trail."""
from fastapi import HTTPException, Request, status

from app.auth.config import settings
from app.auth.dependencies import get_current_user_from_session
from app.models.tables import AuthEvent, User


async def start_impersonation(request: Request, target_email: str, db) -> dict:
    """Admin starts impersonating another user."""
    if not settings.ALLOW_IMPERSONATION:
        raise HTTPException(403, "Impersonation disabled")

    admin = await get_current_user_from_session(request, db)
    if not admin or "admin" not in {r.name for r in admin.roles}:
        raise HTTPException(403, "Admin role required")

    if request.session.get("is_impersonating"):
        raise HTTPException(400, "Already impersonating. Stop first.")

    target = await db.scalar(select(User).where(User.email == target_email))
    if not target:
        raise HTTPException(404, "Target user not found")

    if target.id == admin.id:
        raise HTTPException(400, "Cannot impersonate yourself")

    if "admin" in {r.name for r in target.roles}:
        raise HTTPException(403, "Cannot impersonate another admin")

    # Save current session as the "actor" session, switch to target
    request.session["actor_id"] = str(admin.id)
    request.session["actor_email"] = admin.email
    request.session["user_id"] = str(target.id)
    request.session["is_impersonating"] = True

    db.add(AuthEvent(
        user_id=target.id,
        actor_user_id=admin.id,
        event_type="impersonate_start",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        details={"target_email": target.email},
    ))
    await db.commit()

    return {"actor": admin.email, "target": target.email}


async def stop_impersonation(request: Request, db) -> dict:
    """Restore admin's original session."""
    if not request.session.get("is_impersonating"):
        raise HTTPException(400, "Not currently impersonating")

    actor_id = request.session.get("actor_id")
    actor = await db.get(User, actor_id)

    # Restore actor's session
    request.session["user_id"] = str(actor.id)
    request.session.pop("actor_id", None)
    request.session.pop("actor_email", None)
    request.session["is_impersonating"] = False

    db.add(AuthEvent(
        user_id=actor.id,
        actor_user_id=actor.id,
        event_type="impersonate_stop",
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()

    return {"restored": actor.email}


async def get_actor_and_user(request: Request, db) -> tuple[User, User | None]:
    """Returns (current_user, actor_if_impersonating)."""
    user = await get_current_user_from_session(request, db)
    actor = None
    if request.session.get("is_impersonating"):
        actor_id = request.session.get("actor_id")
        actor = await db.get(User, actor_id)
    return user, actor


def check_impersonation_forbidden(request: Request) -> bool:
    """Returns True if current request path is forbidden during impersonation."""
    if not request.session.get("is_impersonating"):
        return False
    path = request.url.path
    import fnmatch
    return any(fnmatch.fnmatch(path, p) for p in settings.IMPERSONATION_FORBIDDEN_PATHS)
```

### Impersonation endpoints (add to `routes.py`)

```python
@router.post("/impersonate/start")
async def impersonate_start(
    request: Request,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    target_email = body.get("target_email")
    if not target_email:
        raise HTTPException(400, "target_email required")
    return await start_impersonation(request, target_email, db)


@router.post("/impersonate/stop")
async def impersonate_stop(request: Request, db: AsyncSession = Depends(get_db)):
    return await stop_impersonation(request, db)


@router.get("/impersonate/status")
async def impersonate_status(request: Request, db: AsyncSession = Depends(get_db)):
    user, actor = await get_actor_and_user(request, db)
    return {
        "is_impersonating": request.session.get("is_impersonating", False),
        "actor_email": request.session.get("actor_email"),
        "user_email": user.email if user else None,
    }
```

### Enforce forbidden paths

In `main.py`, add middleware:

```python
from app.auth.impersonation import check_impersonation_forbidden

@app.middleware("http")
async def impersonation_guard(request: Request, call_next):
    if check_impersonation_forbidden(request):
        return JSONResponse(
            status_code=403,
            content={"detail": "Action forbidden during impersonation"},
        )
    return await call_next(request)
```

---

## Phase 3 — RBAC enforcement

### `backend/app/auth/dependencies.py`

```python
"""FastAPI dependencies for auth + RBAC."""
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.tables import User


async def get_current_user_from_session(request: Request, db: AsyncSession) -> User | None:
    user_id = request.session.get("user_id")
    if not user_id:
        return None
    user = await db.get(User, user_id)
    if not user or not user.is_active:
        return None
    return user


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    user = await get_current_user_from_session(request, db)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    return user


def require_role(*required: str):
    """Dependency factory: requires the user to have AT LEAST ONE of the listed roles."""
    async def dep(user: User = Depends(get_current_user)) -> User:
        user_role_names = {r.name for r in user.roles}
        if not any(role in user_role_names for role in required):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return user
    return dep
```

### Usage in endpoints

```python
from app.auth.dependencies import require_role, get_actor_and_user

@router.post("/admin/reindex")
async def reindex(
    _: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    ...

@router.delete("/documents/{id}")
async def delete_document(
    id: UUID,
    user: User = Depends(get_current_user),
    actor_and_user = Depends(get_actor_and_user),
    db: AsyncSession = Depends(get_db),
):
    user, actor = actor_and_user
    # `actor` is None if not impersonating, else the admin
    ...
```

---

## Phase 4 — Frontend (Next.js 16)

⚠️ **Important:** Per `frontend/AGENTS.md`, this is Next.js 16 with breaking changes from earlier versions. Before writing route handlers or middleware, check `frontend/node_modules/next/dist/docs/` for the current conventions.

### 4.1 Files to create

```
frontend/src/
├── app/
│   ├── login/page.tsx
│   ├── (authenticated)/
│   │   └── layout.tsx       # Server-side session check
│   └── api/auth/
│       ├── me/route.ts      # Optional Next.js proxy to FastAPI /auth/me
│       └── logout/route.ts
├── components/
│   ├── ImpersonationBanner.tsx
│   └── ImpersonateUserModal.tsx
└── lib/
    └── api.ts                # fetch wrapper with credentials: 'include'
```

### 4.2 `frontend/src/lib/api.ts`

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export async function apiFetch(path: string, init?: RequestInit) {
  return fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
}
```

### 4.3 `frontend/src/app/login/page.tsx`

```tsx
export default function LoginPage() {
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "";
  return (
    <main className="grid place-items-center min-h-screen">
      <a
        href={`${backendUrl}/auth/login`}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg"
      >
        Login with Microsoft
      </a>
    </main>
  );
}
```

### 4.4 `frontend/src/app/(authenticated)/layout.tsx`

```tsx
import { redirect } from "next/navigation";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
    credentials: "include",
    cache: "no-store",
  }).then((r) => (r.ok ? r.json() : null));

  if (!me) redirect("/login");

  return (
    <>
      {me.is_impersonating && <ImpersonationBanner me={me} />}
      {children}
    </>
  );
}
```

### 4.5 `frontend/src/components/ImpersonationBanner.tsx`

```tsx
"use client";
import { useRouter } from "next/navigation";

export function ImpersonationBanner({ me }: { me: any }) {
  const router = useRouter();
  async function stop() {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/impersonate/stop`, {
      method: "POST",
      credentials: "include",
    });
    router.refresh();
  }
  return (
    <div className="bg-yellow-400 text-black px-4 py-2 text-sm flex justify-between">
      <span>
        ⚠️ Impersonating <b>{me.email}</b> (as {me.actor_email})
      </span>
      <button onClick={stop} className="underline font-semibold">
        Stop impersonating
      </button>
    </div>
  );
}
```

### 4.6 `frontend/src/components/ImpersonateUserModal.tsx`

(Admin-only modal with email input → POSTs to `/auth/impersonate/start`)

---

## Phase 5 — Environment variables

### `backend/.env.example` (additions)

```bash
# ── SSO (Microsoft Entra ID) ─────────────────────────────────
ENTRA_TENANT_ID=
ENTRA_CLIENT_ID=
ENTRA_CLIENT_SECRET=
ENTRA_REDIRECT_URI=http://localhost:8000/auth/callback

# ── Session ──────────────────────────────────────────────────
SESSION_SECRET=<openssl rand -hex 32>
SESSION_COOKIE_NAME=cq_session
SESSION_MAX_AGE_SECONDS=28800

# ── Role mapping (Entra group Object IDs) ─────────────────────
ROLE_GROUP_ADMIN=
ROLE_GROUP_REVIEWER=
ROLE_GROUP_AUDITOR=

# ── Impersonation ─────────────────────────────────────────────
ALLOW_IMPERSONATION=true
IMPERSONATION_FORBIDDEN_PATHS=/users/*/delete,/users/*/roles,/config/*,/admin/users
```

### `frontend/.env.local`

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

In production on GCP: store secrets in **GCP Secret Manager**, load at startup. Never commit real secrets.

---

## Phase 6 — Logging

`backend/app/auth/routes.py` already creates `AuthEvent` rows via provisioning and impersonation. Add also:

```python
@router.post("/logout")
async def logout(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_session(request, db)
    if user:
        db.add(AuthEvent(
            user_id=user.id,
            event_type="logout",
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        ))
        await db.commit()
    request.session.clear()
    ...
```

And in `callback`, on success AND on failure (try/except).

---

## Phase 7 — Tests

### 7.1 Unit tests (`backend/tests/auth/`)

**`test_jwt_verification.py`** — mint fake tokens with `authlib.jose`, verify signature, audience, issuer, tenant.

**`test_provisioning.py`** — given valid claims, creates user with `base` role + mapped roles. Given invalid tenant, raises `SecurityError`.

**`test_role_sync.py`** — full sync behavior:
- user in admin group → has `admin` role
- removed from admin group → loses `admin` role (but keeps `base`)
- new user → auto-gets `base`

**`test_tenant_validation.py`** — tokens with wrong `tid` rejected.

**`test_impersonation.py`** — covers all 7 rules from section "Security rules for impersonation" below.

**`test_audit_trail.py`** — impersonated actions store both `user_id` and `actor_user_id`.

### 7.2 Integration tests (`backend/tests/integration/test_auth_flow.py`)

Build a `MockOIDCServer` (small FastAPI app) that mimics Entra endpoints:
- `/.well-known/openid-configuration`
- `/jwks` with a generated keypair
- `/authorize` (just redirects back with a code)
- `/token` (returns a real signed id_token)

Then test the full flow end-to-end through TestClient.

### 7.3 E2E tests (`frontend/tests/e2e/auth.spec.ts`)

Use Playwright's `page.route()` to intercept calls to `login.microsoftonline.com` and return mocked responses:

```typescript
test("login redirects to Microsoft", async ({ page }) => {
  await page.goto("/login");
  await page.click("text=Login with Microsoft");
  await expect(page).toHaveURL(/login\.microsoftonline\.com/);
});

test("unauthenticated user is redirected from protected route", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
```

Microsoft login itself can't be automated (CAPTCHA, MFA) — mock at the boundary.

---

## Phase 8 — Production deployment checklist (GCP)

### Pre-deploy

- [ ] Add prod redirect URI to Entra app: `https://app.yourcompany.com/auth/callback`
- [ ] `SESSION_SECRET` generated via `openssl rand -hex 32`, stored in GCP Secret Manager
- [ ] `ENTRA_CLIENT_SECRET` in GCP Secret Manager
- [ ] `https_only=True` on `SessionMiddleware` in `main.py`
- [ ] CORS configured if frontend and API are on different subdomains (not the case here — same domain)

### Cloud Run / GCP setup

- [ ] Single Cloud Run service or load balancer routing:
  - `/api/*` → FastAPI container
  - everything else → Next.js container
- [ ] HTTPS terminated at load balancer (managed SSL cert)
- [ ] Cookie set with `Domain=.yourcompany.com` only if cross-subdomain needed (not in this case)

### Entra ID hardening

- [ ] **Conditional Access policy:** require MFA
- [ ] **Conditional Access policy:** block sign-in from outside corporate IP ranges (optional)
- [ ] **Sign-in logs:** enable streaming to GCP Cloud Logging
- [ ] **Lock down redirect URIs:** remove `http://localhost:8000` from production app registration

### Monitoring

- [ ] Alert on `auth_events.event_type = 'login_failure'` spikes (potential attack)
- [ ] Alert on `impersonate_start` events (review weekly)
- [ ] Dashboard for active sessions, login rate by user

### Operations

- [ ] Runbook: how to disable a user → `UPDATE users SET is_active=false`
- [ ] Runbook: how to force re-auth → `DELETE FROM auth_events WHERE user_id=...` (no — sessions are stateless; users just log out and back in)
- [ ] Runbook: how to rotate `SESSION_SECRET` → invalidates all sessions, users re-login
- [ ] Runbook: how to rotate `ENTRA_CLIENT_SECRET` → Azure Portal → Certificates & secrets

---

## Security checklist (must-have before going live)

| # | Item | Why |
|---|---|---|
| 1 | PKCE on all OIDC flows | Prevent code interception |
| 2 | `state` parameter | Prevent CSRF |
| 3 | `nonce` in id_token | Prevent replay |
| 4 | Verify JWT signature via JWKS | Prevent token forgery |
| 5 | Verify `aud` claim = `ENTRA_CLIENT_ID` | Prevent token misuse from other apps |
| 6 | Verify `iss` claim = Entra issuer | Prevent tokens from other IdPs |
| 7 | Verify `tid` claim = `ENTRA_TENANT_ID` | Prevent cross-tenant token replay |
| 8 | `HttpOnly` session cookie | Prevent XSS theft |
| 9 | `Secure` session cookie in prod | Prevent MITM |
| 10 | `SameSite=Lax` | Prevent CSRF on POST |
| 11 | `https_only=True` in prod | Enforce HTTPS |
| 12 | Rate-limit `/auth/login` | Prevent enumeration/brute force |
| 13 | Log every login attempt (success + failure) | Audit + alerting |
| 14 | Use `oid` claim as user ID, NOT `sub` | Per-app stable ID in Entra |
| 15 | JWKS caching + rotation handled by Authlib | Performance + correctness |
| 16 | Audit log every impersonation event | Compliance |
| 17 | Forbid impersonation on dangerous paths | Limit blast radius |
| 18 | `require_role()` on all admin endpoints | Authorization |
| 19 | Session max-age 8h | Matches typical Entra session lifetime |
| 20 | Frontend never stores tokens in localStorage | XSS safety |

---

## Critical reminders

1. **`oid` claim, not `sub`** — Entra's `oid` is the per-user stable ID. `sub` is shared across apps in same tenant.
2. **Always validate `tid` (tenant ID)** — even though single-tenant, attackers can replay tokens from other Entra tenants.
3. **Don't store the `access_token`** — only the `id_token` is needed for identity.
4. **`email` is not stable** — users can change it in Entra. Use `sso_subject` for joins.
5. **Group claim has limits** — Entra limits to ~200 groups in token. For users in >200 groups, use Graph API `/me/memberOf`.
6. **Logout is two-step** — local session clear + redirect to `https://login.microsoftonline.com/<tenant>/oauth2/v2.0/logout`.
7. **PKCE even for confidential clients** — defense in depth.

---

## Impersonation security rules

1. Only users with role `admin` can impersonate.
2. Cannot impersonate yourself.
3. Cannot impersonate another `admin` (avoid admin-to-admin chains; add separate "super_admin" role later if needed).
4. Cannot impersonate while already impersonating (no chains).
5. Some actions forbidden during impersonation even for admins:
   - `DELETE /users/{id}`
   - `POST /users/{id}/roles/grant`
   - Any password/credential change on target
   - Config changes
6. Every audit log row stores both `user_id` (target shown in UI) and `actor_user_id` (real human).
7. Every impersonation event logged to `auth_events`.

---

## Open questions / future work

1. **External customers (multitenant):** when you sell to other companies, switch to **multitenant** Entra app registration. Requires admin consent flow + tenant allowlist (validate `tid` against allowed tenants). New design phase.

2. **SAML support:** some big enterprises only do SAML. SAML is heavier than OIDC — add later via `python3-saml` library if needed.

3. **Just-in-time access requests:** instead of admins manually impersonating, build a request flow with time-bound approval. Phase 2.

4. **Service accounts (CI/CD, scripts):** currently no auth method for non-human users. Consider Workload Identity Federation later.

5. **Session refresh:** current setup re-auths every 8 hours. For longer sessions, implement silent refresh via iframe + refresh_token (more complex). Skip until needed.

---

## Reference links

- [Microsoft identity platform docs](https://learn.microsoft.com/en-us/entra/identity-platform/)
- [OIDC on Microsoft Entra ID](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc)
- [Microsoft Graph groups claim](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims)
- [Authlib Starlette integration](https://authlib.org/integrations/starlette/)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

---

## File index (all files this plan touches)

### Backend — NEW

- `backend/app/auth/__init__.py`
- `backend/app/auth/config.py`
- `backend/app/auth/oauth.py`
- `backend/app/auth/routes.py`
- `backend/app/auth/session.py`
- `backend/app/auth/dependencies.py`
- `backend/app/auth/provisioning.py`
- `backend/app/auth/jwt_utils.py`
- `backend/app/auth/impersonation.py`
- `backend/migrations/versions/m4n5o6p7q8r9_sso_and_rbac.py`
- `backend/migrations/versions/n5o6p7q8r9s0_impersonation_audit_columns.py`
- `backend/tests/auth/test_jwt_verification.py`
- `backend/tests/auth/test_provisioning.py`
- `backend/tests/auth/test_role_sync.py`
- `backend/tests/auth/test_tenant_validation.py`
- `backend/tests/auth/test_impersonation.py`
- `backend/tests/auth/test_audit_trail.py`
- `backend/tests/integration/test_auth_flow.py`

### Backend — MODIFY

- `backend/requirements.txt` (add authlib, itsdangerous)
- `backend/.env.example`
- `backend/app/models/tables.py` (User, Role, UserRole, AuthEvent)
- `backend/app/main.py` (SessionMiddleware, auth router, impersonation guard middleware)

### Frontend — NEW

- `frontend/src/app/login/page.tsx`
- `frontend/src/app/(authenticated)/layout.tsx`
- `frontend/src/components/ImpersonationBanner.tsx`
- `frontend/src/components/ImpersonateUserModal.tsx`
- `frontend/src/lib/api.ts`
- `frontend/tests/e2e/auth.spec.ts`

### Frontend — MODIFY (possible)

- Any existing protected route to wrap in `(authenticated)/` route group
- `frontend/AGENTS.md` may need note about SSO integration

---

## When you're ready

Once you have the Entra credentials (Tenant ID, Client ID, Client Secret), tell me and we'll start Phase 1. I'll begin with the backend foundation (authlib setup, config, routes) since that's the entry point — the frontend depends on backend endpoints existing.