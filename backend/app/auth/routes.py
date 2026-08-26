"""Authentication routes: login, callback, logout, me."""
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user_from_session
from app.auth.oauth import oauth
from app.auth.provisioning import get_or_create_user
from app.config import settings
from app.db.session import get_db
from app.models.tables import AuthEvent, User, Role, UserRole

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Auth & SSO"])


@router.get("/login")
async def login(request: Request):
    """Redirect user to Microsoft Entra ID login."""
    if not settings.entra_client_id:
        raise HTTPException(500, "Entra ID client configuration missing.")
    redirect_uri = (settings.entra_redirect_uri or "").strip()
    if not redirect_uri:
        redirect_uri = "http://localhost:8000/auth/callback"
    logger.info(f"Initiating Entra ID SSO login with redirect_uri: {redirect_uri}")
    return await oauth.entra.authorize_redirect(request, redirect_uri)


@router.get("/callback")
async def callback(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle OIDC authorization code callback from Microsoft Entra ID."""
    try:
        token = await oauth.entra.authorize_access_token(request)
        userinfo = dict(token.get("userinfo") or {})
        
        # Prominently print raw Microsoft Entra ID claims to terminal stdout
        print("\n" + "=" * 80)
        print("🔑 RAW RESPONSE RETURNED BY MICROSOFT ENTRA ID SSO:")
        print("Userinfo Claims:", userinfo)
        print("Token Metadata:", {k: v for k, v in token.items() if k != "userinfo"})
        print("=" * 80 + "\n", flush=True)

        request.session["raw_entra_claims"] = userinfo
    except Exception as e:
        logger.error(f"OIDC authorization failed: {e}")
        raise HTTPException(400, f"Authentication failed: {e}")

    try:
        user = await get_or_create_user(userinfo, db)
    except (ValueError, PermissionError) as e:
        logger.error(f"User provisioning failed: {e}")
        raise HTTPException(400, f"User provisioning failed: {e}")

    # Save session details
    request.session["user_id"] = str(user.id)
    request.session["email"] = user.email
    request.session["display_name"] = user.display_name

    # Audit log authentication event
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    db.add(
        AuthEvent(
            user_id=user.id,
            event_type="login_success",
            ip_address=client_ip,
            user_agent=user_agent,
            details={"provider": "entra"},
        )
    )
    await db.commit()

    frontend_redirect = settings.allowed_origins.split(",")[0] or "http://localhost:3000"
    return RedirectResponse(url=frontend_redirect)


@router.post("/logout")
@router.get("/logout")
async def logout(request: Request, db: AsyncSession = Depends(get_db)):
    """Clear local user session and return Entra logout URL."""
    user = await get_current_user_from_session(request, db)
    if user:
        client_ip = request.client.host if request.client else None
        db.add(
            AuthEvent(
                user_id=user.id,
                event_type="logout",
                ip_address=client_ip,
                user_agent=request.headers.get("user-agent"),
            )
        )
        await db.commit()

    request.session.clear()

    post_logout = settings.allowed_origins.split(",")[0] or "http://localhost:3000"
    end_session_url = (
        f"https://login.microsoftonline.com/{settings.entra_tenant_id}/oauth2/v2.0/logout"
        f"?post_logout_redirect_uri={post_logout}"
    )
    return {"status": "success", "message": "Logged out", "logout_url": end_session_url}


@router.get("/me")
async def me(request: Request, db: AsyncSession = Depends(get_db)):
    """Return currently authenticated user from session."""
    user = await get_current_user_from_session(request, db)
    if not user:
        return {"authenticated": False, "user": None}

    user_roles = [r.name for r in user.roles] if hasattr(user, "roles") and user.roles else []

    return {
        "authenticated": True,
        "user": {
            "id": str(user.id),
            "email": user.email,
            "display_name": user.display_name,
            "roles": user_roles,
            "is_active": user.is_active,
            "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        },
    }


@router.get("/debug")
async def debug_sso_session(request: Request, db: AsyncSession = Depends(get_db)):
    """Debug endpoint returning raw Microsoft Entra OIDC claims received upon login."""
    user = await get_current_user_from_session(request, db)
    return {
        "raw_microsoft_entra_claims": request.session.get("raw_entra_claims"),
        "authenticated_user_in_db": {
            "id": str(user.id) if user else None,
            "email": user.email if user else None,
            "display_name": user.display_name if user else None,
            "roles": [r.name for r in user.roles] if user and hasattr(user, "roles") and user.roles else [],
        } if user else None
    }


@router.post("/reset-admin")
@router.post("/api/auth/reset-admin")
async def reset_admin_role_endpoint(request: Request, db: AsyncSession = Depends(get_db)):
    """Temporary dev endpoint: Reset user role to admin for adamamzar email."""
    user = await get_current_user_from_session(request, db)
    if not user or "adamamzar" not in user.email.lower():
        raise HTTPException(403, "Only adamamzar email is permitted to run temporary admin reset.")

    admin_role_res = await db.execute(select(Role).where(Role.name == "admin"))
    admin_role = admin_role_res.scalar_one_or_none()
    if not admin_role:
        raise HTTPException(500, "Admin role 'admin' not found in database.")

    await db.execute(delete(UserRole).where(UserRole.user_id == user.id))
    db.add(UserRole(user_id=user.id, role_id=admin_role.id))
    await db.commit()
    logger.info(f"⚡ Restored 'admin' role for {user.email}")
    return {"status": "success", "message": f"Restored admin role for {user.email}"}
