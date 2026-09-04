"""Authentication routes: login, callback, logout, me."""
import logging
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user_from_session
from app.auth.oauth import oauth
from app.auth.provisioning import get_or_create_user
from app.config import settings
from app.db.session import get_db, get_session_factory
from app.models.tables import AuthEvent
from app.services.timezones import to_malaysia

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

    # Save session details into cryptographically signed session cookie
    user_roles = [r.name for r in user.roles] if hasattr(user, "roles") and user.roles else ["user"]
    last_login_formatted = (
        to_malaysia(user.last_login_at).strftime("%d/%m/%Y, %H:%M:%S")
        if user.last_login_at
        else None
    )

    request.session["user_id"] = str(user.id)
    request.session["email"] = user.email
    request.session["display_name"] = user.display_name
    request.session["roles"] = user_roles
    request.session["is_active"] = bool(user.is_active)
    request.session["last_login_at"] = last_login_formatted

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

    frontend_redirect = (settings.allowed_origins.split(",")[0] or "http://localhost:3000").rstrip("/") + "/"
    response = RedirectResponse(url=frontend_redirect)
    response.set_cookie(
        key="cq_logged_in",
        value="1",
        max_age=settings.session_max_age_seconds,
        httponly=False,
        samesite="lax",
        secure=settings.environment.lower() == "production",
        path="/",
    )
    return response


@router.post("/logout")
@router.get("/logout")
async def logout(request: Request):
    """Clear local user session and return Entra logout URL."""
    user_id = request.session.get("user_id")
    if user_id:
        try:
            factory = get_session_factory()
            async with factory() as db:
                client_ip = request.client.host if request.client else None
                db.add(
                    AuthEvent(
                        user_id=user_id,
                        event_type="logout",
                        ip_address=client_ip,
                        user_agent=request.headers.get("user-agent"),
                    )
                )
                await db.commit()
        except Exception as e:
            logger.warning(f"Could not record logout event: {e}")

    request.session.clear()

    post_logout = settings.allowed_origins.split(",")[0] or "http://localhost:3000"
    end_session_url = (
        f"https://login.microsoftonline.com/{settings.entra_tenant_id}/oauth2/v2.0/logout"
        f"?post_logout_redirect_uri={post_logout}"
    )
    response = JSONResponse(
        content={"status": "success", "message": "Logged out", "logout_url": end_session_url}
    )
    response.delete_cookie(key="cq_logged_in", path="/")
    return response


@router.get("/me")
async def me(request: Request, response: Response):
    """Return currently authenticated user directly from cryptographically signed session cookie.

    Bypasses PostgreSQL queries completely so Neon DB stays asleep and within the free tier.
    """
    user_id = request.session.get("user_id")
    if not user_id:
        response.delete_cookie(key="cq_logged_in", path="/")
        return {"authenticated": False, "user": None}

    # Ensure indicator cookie is set when active session is present
    response.set_cookie(
        key="cq_logged_in",
        value="1",
        max_age=settings.session_max_age_seconds,
        httponly=False,
        samesite="lax",
        secure=settings.environment.lower() == "production",
        path="/",
    )

    # 1. Fast-path: read verified data directly from signed Starlette session cookie (0 DB queries!)
    if "roles" in request.session and "email" in request.session:
        return {
            "authenticated": True,
            "user": {
                "id": user_id,
                "email": request.session.get("email"),
                "display_name": request.session.get("display_name"),
                "roles": request.session.get("roles") or ["user"],
                "is_active": request.session.get("is_active", True),
                "last_login_at": request.session.get("last_login_at"),
            },
        }

    # 2. Fallback path for legacy session cookies created prior to embedding roles
    try:
        factory = get_session_factory()
        async with factory() as db:
            user = await get_current_user_from_session(request, db)
            if not user:
                response.delete_cookie(key="cq_logged_in", path="/")
                return {"authenticated": False, "user": None}

            user_roles = [r.name for r in user.roles] if hasattr(user, "roles") and user.roles else ["user"]
            last_login = (
                to_malaysia(user.last_login_at).strftime("%d/%m/%Y, %H:%M:%S")
                if user.last_login_at
                else None
            )

            # Upgrade cookie in-place for future zero-DB fast-path requests
            request.session["roles"] = user_roles
            request.session["is_active"] = bool(user.is_active)
            request.session["last_login_at"] = last_login

            return {
                "authenticated": True,
                "user": {
                    "id": str(user.id),
                    "email": user.email,
                    "display_name": user.display_name,
                    "roles": user_roles,
                    "is_active": user.is_active,
                    "last_login_at": last_login,
                },
            }
    except Exception as e:
        logger.error(f"Error resolving legacy user session: {e}")
        response.delete_cookie(key="cq_logged_in", path="/")
        return {"authenticated": False, "user": None}


@router.get("/debug")
async def debug_sso_session(request: Request):
    """Debug endpoint returning raw Microsoft Entra OIDC claims received upon login."""
    return {
        "raw_microsoft_entra_claims": request.session.get("raw_entra_claims"),
        "authenticated_user_in_session": {
            "id": request.session.get("user_id"),
            "email": request.session.get("email"),
            "display_name": request.session.get("display_name"),
            "roles": request.session.get("roles"),
            "is_active": request.session.get("is_active"),
            "last_login_at": request.session.get("last_login_at"),
        }
    }
