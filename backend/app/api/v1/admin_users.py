"""Admin API endpoints for User Management and Role Assignments using Firebase Firestore."""
from datetime import datetime, timezone
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from google.cloud.firestore_v1.async_client import AsyncClient
from pydantic import BaseModel, EmailStr

from app.auth.routes import format_login_timestamp
from app.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Admin — User Management"])


class UserRoleUpdateSchema(BaseModel):
    roles: List[str]


class CreateUserSchema(BaseModel):
    email: EmailStr
    roles: List[str] = ["user"]
    display_name: Optional[str] = None


@router.get("/api/admin/users", response_model=dict)
@router.get("/api/admin/users/", response_model=dict)
@router.get("/admin/users", response_model=dict)
@router.get("/admin/users/", response_model=dict)
async def list_users(db: AsyncClient = Depends(get_db)):
    """List all registered and pre-seeded users with their roles from Firestore."""
    user_list = []
    async for doc in db.collection("users").stream():
        u = doc.to_dict() or {}
        email = u.get("email") or doc.id
        user_list.append({
            "id": email,
            "email": email,
            "display_name": u.get("display_name"),
            "roles": u.get("roles") or ["user"],
            "sso_subject": u.get("sso_subject"),
            "is_active": u.get("is_active", True),
            "last_login_at": format_login_timestamp(u.get("last_login_at")),
            "created_at": format_login_timestamp(u.get("created_at")),
            "status": "Active (SSO Linked)" if u.get("sso_subject") else "Pre-seeded (Pending Login)",
        })

    # Sort descending by created_at
    user_list.sort(key=lambda x: x["created_at"] or "", reverse=True)

    # Available system roles
    all_roles = []
    async for doc in db.collection("roles").stream():
        r = doc.to_dict() or {}
        all_roles.append({
            "id": doc.id,
            "name": r.get("name", doc.id),
            "display_name": r.get("display_name", doc.id.capitalize()),
        })

    return {"users": user_list, "available_roles": all_roles}


@router.post("/api/admin/users", status_code=status.HTTP_201_CREATED)
@router.post("/admin/users", status_code=status.HTTP_201_CREATED)
async def create_or_preseed_user(
    body: CreateUserSchema,
    db: AsyncClient = Depends(get_db),
):
    """Pre-seed or invite a user by email with pre-assigned roles in Firestore."""
    email = body.email.lower().strip()
    user_ref = db.collection("users").document(email)

    snap = await user_ref.get()
    if snap.exists:
        raise HTTPException(400, f"User with email '{email}' already exists.")

    now_iso = datetime.now(timezone.utc).isoformat()
    await user_ref.set({
        "email": email,
        "display_name": body.display_name or email.split("@")[0],
        "roles": body.roles or ["user"],
        "sso_subject": None,
        "is_active": True,
        "created_at": now_iso,
        "last_login_at": None,
    })
    logger.info(f"Pre-seeded user '{email}' in Firestore with roles: {body.roles}")

    return {
        "status": "success",
        "message": f"Pre-seeded user '{email}' successfully.",
        "user_id": email,
    }


@router.put("/api/admin/users/{user_id}/roles")
@router.put("/admin/users/{user_id}/roles")
async def update_user_roles(
    user_id: str,
    body: UserRoleUpdateSchema,
    request: Request,
    db: AsyncClient = Depends(get_db),
):
    """Update assigned roles for an existing user in Firestore."""
    email = user_id.lower().strip()
    user_ref = db.collection("users").document(email)

    snap = await user_ref.get()
    if not snap.exists:
        raise HTTPException(404, f"User '{email}' not found")

    await user_ref.update({"roles": body.roles})
    logger.info(f"Updated roles for user '{email}' to {body.roles}")

    # If the user is editing their own account, update the session cookie in-place
    current_uid = request.session.get("email") or request.session.get("user_id")
    if current_uid and current_uid.lower().strip() == email:
        request.session["roles"] = body.roles

    return {"status": "success", "message": f"Roles updated for user '{email}'."}


@router.delete("/api/admin/users/{user_id}")
@router.delete("/admin/users/{user_id}")
async def delete_user(
    user_id: str,
    db: AsyncClient = Depends(get_db),
):
    """Delete a user document from Firestore."""
    email = user_id.lower().strip()
    user_ref = db.collection("users").document(email)

    snap = await user_ref.get()
    if not snap.exists:
        raise HTTPException(404, f"User '{email}' not found")

    await user_ref.delete()
    logger.info(f"Deleted user '{email}' from Firestore")

    return {"status": "success", "message": f"User '{email}' deleted."}
