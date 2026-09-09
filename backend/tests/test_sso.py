"""Unit and Integration Tests for SSO, JIT Provisioning, RBAC, and Admin User APIs with Firestore."""
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest

from app.auth.dependencies import require_role
from app.auth.provisioning import get_or_create_user
from app.config import settings
from app.db.session import get_db
from app.main import app
from app.models.tables import User


@pytest.mark.asyncio
async def test_jit_provisioning_missing_email():
    """Test that get_or_create_user raises ValueError if claims contain no email."""
    claims = {"oid": "1111-2222", "name": "No Email User"}
    mock_db = MagicMock()

    with pytest.raises(ValueError, match="No email found in Entra ID token claims"):
        await get_or_create_user(claims, mock_db)


@pytest.mark.asyncio
async def test_jit_provisioning_tenant_mismatch():
    """Test that get_or_create_user raises PermissionError if tid does not match entra_tenant_id."""
    claims = {
        "oid": "1111-2222",
        "email": "user@gamuda.com.my",
        "tid": "foreign-tenant-id-9999",
    }
    mock_db = MagicMock()

    with patch.object(settings, "entra_tenant_id", "expected-tenant-id-1111"):
        with pytest.raises(PermissionError, match="Token from unexpected Entra tenant"):
            await get_or_create_user(claims, mock_db)


@pytest.mark.asyncio
async def test_jit_provisioning_creates_new_user():
    """Test that a brand new user is auto-provisioned (JIT) with default 'user' role in Firestore."""
    claims = {
        "oid": "oid-user-123",
        "tid": "expected-tenant-id-1111",
        "email": "new.employee@gamuda.com.my",
        "name": "New Employee",
    }

    mock_db = MagicMock()
    mock_user_ref = MagicMock()
    mock_snap = MagicMock()
    mock_snap.exists = False
    mock_user_ref.get = AsyncMock(return_value=mock_snap)
    mock_user_ref.set = AsyncMock()

    mock_db.collection.return_value.document.return_value = mock_user_ref

    async def empty_stream():
        if False:
            yield None

    mock_db.collection.return_value.where.return_value.limit.return_value.stream = empty_stream

    with patch.object(settings, "entra_tenant_id", "expected-tenant-id-1111"):
        user = await get_or_create_user(claims, mock_db)

    assert user.email == "new.employee@gamuda.com.my"
    assert user.display_name == "New Employee"
    assert user.sso_subject == "oid-user-123"
    assert user.roles == ["user"]
    assert user.is_active is True
    assert mock_user_ref.set.called


@pytest.mark.asyncio
async def test_jit_provisioning_existing_user_update():
    """Test that logging in an existing user updates sso metadata and last_login_at in Firestore."""
    claims = {
        "oid": "oid-user-123",
        "tid": "expected-tenant-id-1111",
        "email": "existing.employee@gamuda.com.my",
        "name": "Existing Employee",
    }

    mock_db = MagicMock()
    mock_user_ref = MagicMock()
    mock_snap = MagicMock()
    mock_snap.exists = True
    mock_snap.to_dict.return_value = {
        "email": "existing.employee@gamuda.com.my",
        "display_name": "Existing Employee",
        "sso_subject": None,
        "roles": ["user"],
        "is_active": True,
    }
    mock_user_ref.get = AsyncMock(return_value=mock_snap)
    mock_user_ref.update = AsyncMock()

    mock_db.collection.return_value.document.return_value = mock_user_ref

    with patch.object(settings, "entra_tenant_id", "expected-tenant-id-1111"):
        user = await get_or_create_user(claims, mock_db)

    assert user.email == "existing.employee@gamuda.com.my"
    assert user.sso_subject == "oid-user-123"
    assert user.last_login_at is not None
    assert mock_user_ref.update.called


@pytest.mark.asyncio
async def test_require_role_dependency_granted():
    """Test RBAC dependency allows execution when user possesses required role."""
    user = User(email="admin@gamuda.com.my", roles=["admin"])

    dep_fn = require_role("admin")
    result_user = await dep_fn(user=user)
    assert result_user.email == "admin@gamuda.com.my"


@pytest.mark.asyncio
async def test_require_role_dependency_denied():
    """Test RBAC dependency raises 403 Forbidden when user lacks required role."""
    user = User(email="employee@gamuda.com.my", roles=["user"])

    dep_fn = require_role("admin", "manager")
    with pytest.raises(HTTPException) as exc_info:
        await dep_fn(user=user)

    assert exc_info.value.status_code == 403
    assert "Insufficient permissions" in exc_info.value.detail


def test_admin_user_api_endpoint_routing():
    """Test that /api/admin/users route is correctly registered in FastAPI app."""
    mock_db = MagicMock()

    async def empty_stream():
        if False:
            yield None

    mock_db.collection.return_value.stream = empty_stream

    async def override_get_db():
        return mock_db

    app.dependency_overrides[get_db] = override_get_db
    try:
        client = TestClient(app)
        response = client.get(
            "/api/admin/users",
            headers={
                "X-Internal-Secret": settings.internal_api_secret,
                "X-User-Email": "test.admin@gamuda.com.my",
            },
        )
        assert response.status_code == 200
        assert "users" in response.json()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_jit_provisioning_b2b_guest_email():
    """Test that B2B guest account #EXT# email is parsed to standard email."""
    claims = {
        "oid": "oid-guest-123",
        "tid": "expected-tenant-id-1111",
        "email": "contractor_partner.com#EXT#@gamuda.onmicrosoft.com",
        "name": "Contractor Partner",
    }
    mock_db = MagicMock()
    mock_user_ref = MagicMock()
    mock_snap = MagicMock()
    mock_snap.exists = False
    mock_user_ref.get = AsyncMock(return_value=mock_snap)
    mock_user_ref.set = AsyncMock()

    mock_db.collection.return_value.document.return_value = mock_user_ref

    async def empty_stream():
        if False:
            yield None

    mock_db.collection.return_value.where.return_value.limit.return_value.stream = empty_stream

    with patch.object(settings, "entra_tenant_id", "expected-tenant-id-1111"):
        user = await get_or_create_user(claims, mock_db)

    assert user.email == "contractor@partner.com"


def test_callback_error_query_param_redirects():
    """Test that /auth/callback?error=access_denied redirects to /login?error=user_cancelled."""
    client = TestClient(app, follow_redirects=False)
    response = client.get("/auth/callback?error=access_denied&error_description=User+cancelled")
    assert response.status_code == 302
    assert "/login?error=user_cancelled" in response.headers["location"]
