"""FastAPI dependencies for authentication and Role-Based Access Control (RBAC)."""
import logging
from typing import Callable
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.tables import User

logger = logging.getLogger(__name__)


async def get_current_user_from_session(request: Request, db: AsyncSession) -> User | None:
    """Retrieve currently authenticated user from Starlette session cookie."""
    user_id = request.session.get("user_id")
    if not user_id:
        return None

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        return None
    return user



async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Dependency that requires an authenticated, active user."""
    user = await get_current_user_from_session(request, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in.",
        )
    return user


def require_role(*required_roles: str) -> Callable:
    """Dependency factory enforcing that the user has at least one of the specified roles."""
    async def role_checker(user: User = Depends(get_current_user)) -> User:
        user_role_names = {r.name for r in user.roles} if user.roles else set()
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
