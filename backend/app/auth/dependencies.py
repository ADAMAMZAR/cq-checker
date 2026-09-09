"""FastAPI dependencies for authentication and Role-Based Access Control (RBAC) using Firestore."""
import logging
from typing import Callable, Optional
from fastapi import Depends, HTTPException, Request, status
from google.cloud.firestore_v1.async_client import AsyncClient

from app.db.session import get_db
from app.models.tables import User

logger = logging.getLogger(__name__)


async def get_current_user_from_session(request: Request, db: AsyncClient) -> Optional[User]:
    """Retrieve currently authenticated user from Starlette session cookie via Firestore."""
    email = request.session.get("email") or request.session.get("user_id")
    if not email:
        return None

    email = email.lower().strip()
    snap = await db.collection("users").document(email).get()
    if not snap.exists:
        return None

    return User.from_dict(snap.to_dict() or {}, doc_id=email)


async def get_current_user(
    request: Request,
    db: AsyncClient = Depends(get_db),
) -> User:
    """Dependency that requires an authenticated, active user."""
    user = await get_current_user_from_session(request, db)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required or account deactivated. Please log in.",
        )
    return user


def require_role(*required_roles: str) -> Callable:
    """Dependency factory enforcing that the user has at least one of the specified roles."""
    async def role_checker(user: User = Depends(get_current_user)) -> User:
        user_role_names = set(user.roles) if user.roles else set()
        if not any(role in user_role_names for role in required_roles):
            logger.warning(
                f"Access denied for user '{user.email}' requiring roles {required_roles}. Current roles: {user_role_names}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required role: {', '.join(required_roles)}",
            )
        return user

    return role_checker
