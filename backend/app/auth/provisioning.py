"""JIT user provisioning and Entra ID group-to-role synchronization."""
import logging
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.config import get_role_mapping
from app.config import settings
from app.models.tables import Role, User, UserRole

logger = logging.getLogger(__name__)


async def get_or_create_user(claims: dict, db: AsyncSession) -> User:
    """Provision new user or update existing user on Entra ID OIDC login callback."""
    sso_subject = claims.get("oid") or claims.get("sub")
    tenant_id = claims.get("tid")
    email = (
        claims.get("email")
        or claims.get("upn")
        or claims.get("preferred_username")
        or claims.get("unique_name")
    )
    if not email:
        raise ValueError("No email found in Entra ID token claims.")

    email = email.lower().strip()
    display_name = claims.get("name") or email.split("@")[0]

    # Reject token if tenant_id doesn't match expected Entra tenant
    if settings.entra_tenant_id and tenant_id and tenant_id != settings.entra_tenant_id:
        logger.warning(f"Rejecting SSO login from unexpected tenant: {tenant_id}")
        raise PermissionError(f"Token from unexpected Entra tenant: {tenant_id}")

    # Search by SSO subject first, fallback to email match
    user = None
    if sso_subject:
        result = await db.execute(select(User).where(User.sso_subject == sso_subject))
        user = result.scalar_one_or_none()

    if not user:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

    if not user:
        user = User(
            email=email,
            display_name=display_name,
            sso_subject=sso_subject,
            sso_provider="entra",
            sso_tenant_id=tenant_id,
            is_active=True,
        )
        db.add(user)
        await db.flush()

        # Grant default 'user' role for new auto-provisioned users
        role_res = await db.execute(select(Role).where(Role.name == "user"))
        default_role = role_res.scalar_one_or_none()
        if default_role:
            db.add(UserRole(user_id=user.id, role_id=default_role.id))
        logger.info(f"Provisioned new SSO user: {email} ({user.id})")
    else:
        # Update existing user SSO metadata and sync display name from Entra claims
        if display_name:
            user.display_name = display_name
        if sso_subject and not user.sso_subject:
            user.sso_subject = sso_subject
        if tenant_id and not user.sso_tenant_id:
            user.sso_tenant_id = tenant_id

    user.last_login_at = datetime.now(timezone.utc)

    # Sync roles from Entra security groups if groups claim present
    entra_group_ids = claims.get("groups", [])
    if entra_group_ids:
        await sync_roles_from_groups(user, entra_group_ids, db)

    await db.commit()
    return user


async def sync_roles_from_groups(user: User, entra_group_ids: list[str], db: AsyncSession):
    """Map Entra Security Group Object IDs to application roles."""
    group_map = get_role_mapping()
    if not group_map:
        return

    desired_role_names = {"user"}  # everyone gets default user role
    for gid in entra_group_ids:
        if gid in group_map:
            desired_role_names.add(group_map[gid])

    # Fetch role records for desired role names
    role_res = await db.execute(select(Role).where(Role.name.in_(desired_role_names)))
    desired_roles = role_res.scalars().all()

    # Fetch current roles
    current_role_ids = {r.id for r in user.roles} if user.roles else set()

    for role in desired_roles:
        if role.id not in current_role_ids:
            db.add(UserRole(user_id=user.id, role_id=role.id))
            logger.info(f"Granted role '{role.name}' to user '{user.email}' from Entra group sync")
