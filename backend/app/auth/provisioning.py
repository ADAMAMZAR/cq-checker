"""JIT user provisioning and Entra ID group-to-role synchronization using Firebase Firestore."""
import logging
from datetime import datetime, timezone
from typing import Optional

from google.cloud.firestore_v1.async_client import AsyncClient

from app.auth.config import get_role_mapping
from app.config import settings
from app.models.tables import User

logger = logging.getLogger(__name__)


def sync_roles_from_groups(current_roles: list[str], entra_group_ids: list[str]) -> list[str]:
    """Map Entra Security Group Object IDs to application roles."""
    group_map = get_role_mapping()
    roles_set = set(current_roles or ["user"])
    if group_map and entra_group_ids:
        for gid in entra_group_ids:
            if gid in group_map:
                roles_set.add(group_map[gid])
    return list(roles_set)


async def get_or_create_user(claims: dict, db: AsyncClient) -> User:
    """Provision new user or update existing user on Entra ID OIDC login callback in Firestore."""
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

    if "#ext#" in email.lower():
        prefix = email.split("#EXT#")[0].split("#ext#")[0]
        if "_" in prefix:
            r_idx = prefix.rfind("_")
            email = prefix[:r_idx] + "@" + prefix[r_idx + 1:]

    email = email.lower().strip()
    display_name = claims.get("name") or email.split("@")[0]

    # Reject token if tenant_id doesn't match expected Entra tenant
    if settings.entra_tenant_id and tenant_id and tenant_id != settings.entra_tenant_id:
        logger.warning(f"Rejecting SSO login from unexpected tenant: {tenant_id}")
        raise PermissionError(f"Token from unexpected Entra tenant: {tenant_id}")

    now_iso = datetime.now(timezone.utc).isoformat()
    users_coll = db.collection("users")

    # 1. Look up user by document ID (email)
    user_ref = users_coll.document(email)
    snap = await user_ref.get()

    user_data: Optional[dict] = None

    if snap.exists:
        user_data = snap.to_dict() or {}
    elif sso_subject:
        # Fallback: check by sso_subject query
        sso_query = users_coll.where("sso_subject", "==", sso_subject).limit(1)
        async for doc in sso_query.stream():
            user_ref = doc.reference
            user_data = doc.to_dict() or {}
            break

    entra_group_ids = claims.get("groups", [])

    if not user_data:
        # Auto-provision new user
        roles = sync_roles_from_groups(["user"], entra_group_ids)
        user_data = {
            "email": email,
            "display_name": display_name,
            "sso_subject": sso_subject,
            "roles": roles,
            "is_active": True,
            "created_at": now_iso,
            "last_login_at": now_iso,
        }
        await user_ref.set(user_data)
        logger.info(f"Provisioned new SSO user in Firestore: {email} with roles {roles}")
    else:
        # Update existing user metadata and last_login_at
        updates = {"last_login_at": now_iso}
        if display_name and user_data.get("display_name") != display_name:
            updates["display_name"] = display_name
            user_data["display_name"] = display_name
        if sso_subject and not user_data.get("sso_subject"):
            updates["sso_subject"] = sso_subject
            user_data["sso_subject"] = sso_subject

        if entra_group_ids:
            updated_roles = sync_roles_from_groups(user_data.get("roles", ["user"]), entra_group_ids)
            if set(updated_roles) != set(user_data.get("roles", [])):
                updates["roles"] = updated_roles
                user_data["roles"] = updated_roles

        user_data["last_login_at"] = now_iso
        await user_ref.update(updates)
        logger.info(f"Updated login timestamp for existing SSO user: {email}")

    return User.from_dict(user_data, doc_id=email)
