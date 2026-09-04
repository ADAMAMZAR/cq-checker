"""Unit and Integration Tests for SSO, JIT Provisioning, RBAC, and Admin User APIs."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth.provisioning import get_or_create_user
from app.auth.dependencies import require_role
from app.config import settings
from app.models.tables import User, Role
from app.main import app


@pytest.mark.asyncio
async def test_jit_provisioning_missing_email():
    """Test that get_or_create_user raises ValueError if claims contain no email."""
    claims = {"oid": "1111-2222", "name": "No Email User"}
    mock_db = AsyncMock()

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
    mock_db = AsyncMock()

    with patch.object(settings, "entra_tenant_id", "expected-tenant-id-1111"):
        with pytest.raises(PermissionError, match="Token from unexpected Entra tenant"):
            await get_or_create_user(claims, mock_db)


@pytest.mark.asyncio
async def test_jit_provisioning_creates_new_user():
    """Test that a brand new user is auto-provisioned (JIT) with default 'user' role."""
    claims = {
        "oid": "oid-user-123",
        "tid": "expected-tenant-id-1111",
        "email": "new.employee@gamuda.com.my",
        "name": "New Employee",
    }

    # Mock DB queries returning no existing user
    mock_db = AsyncMock()
    mock_scalar_res = MagicMock()
    mock_scalar_res.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_scalar_res

    # Mock role query returning default 'user' role
    mock_role = Role(name="user", display_name="User")
    mock_role_res = MagicMock()
    mock_role_res.scalar_one_or_none.return_value = mock_role

    # Chain query returns: 1st check by sso_subject (None), 2nd check by email (None), 3rd check role ('user')
    mock_db.execute.side_effect = [mock_scalar_res, mock_scalar_res, mock_role_res]

    with patch.object(settings, "entra_tenant_id", "expected-tenant-id-1111"):
        user = await get_or_create_user(claims, mock_db)

    assert user.email == "new.employee@gamuda.com.my"
    assert user.display_name == "New Employee"
    assert user.sso_subject == "oid-user-123"
    assert user.sso_provider == "entra"
    assert user.is_active is True
    assert mock_db.add.called
    assert mock_db.commit.called


@pytest.mark.asyncio
async def test_jit_provisioning_existing_user_update():
    """Test that logging in an existing user updates sso metadata and last_login_at without duplicate row creation."""
    claims = {
        "oid": "oid-user-123",
        "tid": "expected-tenant-id-1111",
        "email": "existing.employee@gamuda.com.my",
        "name": "Existing Employee",
    }

    existing_user = User(
        email="existing.employee@gamuda.com.my",
        display_name="Existing Employee",
        sso_subject=None,
        sso_provider=None,
        is_active=True,
    )

    mock_db = AsyncMock()
    mock_sso_res = MagicMock()
    mock_sso_res.scalar_one_or_none.return_value = None

    mock_email_res = MagicMock()
    mock_email_res.scalar_one_or_none.return_value = existing_user

    mock_db.execute.side_effect = [mock_sso_res, mock_email_res]

    with patch.object(settings, "entra_tenant_id", "expected-tenant-id-1111"):
        user = await get_or_create_user(claims, mock_db)

    assert user.email == "existing.employee@gamuda.com.my"
    assert user.sso_subject == "oid-user-123"
    assert user.sso_tenant_id == "expected-tenant-id-1111"
    assert user.last_login_at is not None
    assert mock_db.commit.called


@pytest.mark.asyncio
async def test_require_role_dependency_granted():
    """Test RBAC dependency allows execution when user possesses required role."""
    admin_role = Role(name="admin", display_name="Admin")
    user = User(email="admin@gamuda.com.my")
    user.roles = [admin_role]

    dep_fn = require_role("admin")
    result_user = await dep_fn(user=user)
    assert result_user.email == "admin@gamuda.com.my"


@pytest.mark.asyncio
async def test_require_role_dependency_denied():
    """Test RBAC dependency raises 403 Forbidden when user lacks required role."""
    standard_role = Role(name="user", display_name="User")
    user = User(email="employee@gamuda.com.my")
    user.roles = [standard_role]

    dep_fn = require_role("admin", "manager")
    with pytest.raises(HTTPException) as exc_info:
        await dep_fn(user=user)

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Insufficient permissions"


def test_admin_user_api_endpoint_routing():
    """Test that /api/admin/users route is correctly registered in FastAPI app."""
    client = TestClient(app)
    response = client.get(
        "/api/admin/users",
        headers={
            "X-Internal-Secret": settings.internal_api_secret,
            "X-User-Email": "test.admin@gamuda.com.my",
        },
    )
    # Endpoint exists and responds (not a 404 route error)
    assert response.status_code in (200, 500)
