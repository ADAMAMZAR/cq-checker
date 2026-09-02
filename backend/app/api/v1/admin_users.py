"""Admin API endpoints for User Management and Role Assignments."""
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.tables import User, Role, UserRole
from app.services.timezones import to_malaysia

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Admin — User Management"])


class UserRoleUpdateSchema(BaseModel):
    roles: List[str]


class CreateUserSchema(BaseModel):
    email: EmailStr
    roles: List[str] = ["user"]
    display_name: Optional[str] = None


@router.get("/api/admin/users", response_model=dict)
@router.get("/admin/users", response_model=dict)
async def list_users(db: AsyncSession = Depends(get_db)):
    """List all registered and pre-seeded users with their roles."""
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()

    user_list = []
    for u in users:
        role_names = [r.name for r in u.roles] if hasattr(u, "roles") and u.roles else []
        user_list.append({
            "id": str(u.id),
            "email": u.email,
            "display_name": u.display_name,
            "roles": role_names,
            "sso_subject": u.sso_subject,
            "sso_provider": u.sso_provider,
            "is_active": u.is_active,
            "last_login_at": to_malaysia(u.last_login_at).strftime("%d/%m/%Y, %H:%M:%S") if u.last_login_at else None,
            "created_at": to_malaysia(u.created_at).strftime("%d/%m/%Y, %H:%M:%S") if u.created_at else None,
            "status": "Active (SSO Linked)" if u.sso_subject else "Pre-seeded (Pending Login)",
        })

    # Available system roles
    roles_res = await db.execute(select(Role))
    all_roles = [{"id": str(r.id), "name": r.name, "display_name": r.display_name} for r in roles_res.scalars().all()]

    return {"users": user_list, "available_roles": all_roles}


@router.post("/api/admin/users", status_code=status.HTTP_201_CREATED)
@router.post("/admin/users", status_code=status.HTTP_201_CREATED)
async def create_or_preseed_user(
    body: CreateUserSchema,
    db: AsyncSession = Depends(get_db),
):
    """Pre-seed or invite a user by email with pre-assigned roles."""
    email = body.email.lower().strip()

    # Check if user already exists
    existing = await db.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(400, f"User with email '{email}' already exists.")

    new_user = User(
        email=email,
        display_name=body.display_name or email.split("@")[0],
        is_active=True,
    )
    db.add(new_user)
    await db.flush()

    # Assign roles
    if body.roles:
        roles_res = await db.execute(select(Role).where(Role.name.in_(body.roles)))
        target_roles = roles_res.scalars().all()
        for r in target_roles:
            db.add(UserRole(user_id=new_user.id, role_id=r.id))

    await db.commit()
    logger.info(f"Pre-seeded user '{email}' with roles: {body.roles}")

    return {
        "status": "success",
        "message": f"Pre-seeded user '{email}' successfully.",
        "user_id": str(new_user.id),
    }


@router.put("/api/admin/users/{user_id}/roles")
@router.put("/admin/users/{user_id}/roles")
async def update_user_roles(
    user_id: str,
    body: UserRoleUpdateSchema,
    db: AsyncSession = Depends(get_db),
):
    """Update assigned roles for an existing user."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    # Remove existing role links
    await db.execute(delete(UserRole).where(UserRole.user_id == user.id))
    await db.flush()

    # Add new role links
    if body.roles:
        roles_res = await db.execute(select(Role).where(Role.name.in_(body.roles)))
        target_roles = roles_res.scalars().all()
        for r in target_roles:
            db.add(UserRole(user_id=user.id, role_id=r.id))

    await db.commit()
    logger.info(f"Updated roles for user '{user.email}' to {body.roles}")

    return {"status": "success", "message": f"Roles updated for user '{user.email}'."}


@router.delete("/api/admin/users/{user_id}")
@router.delete("/admin/users/{user_id}")
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a user record."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    email = user.email
    await db.delete(user)
    await db.commit()
    logger.info(f"Deleted user '{email}' ({user_id})")

    return {"status": "success", "message": f"User '{email}' deleted."}
