"""Authentication routes: login, callback, logout, me using Firebase Firestore."""
from datetime import datetime, timezone
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from google.cloud.firestore_v1.async_client import AsyncClient

from app.auth.dependencies import get_current_user_from_session
from app.auth.oauth import oauth
from app.auth.provisioning import get_or_create_user
from app.config import settings
from app.core.limiter import limiter
from app.db.session import get_db, get_firestore_client
from app.services.timezones import to_malaysia

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Auth & SSO"])


def format_login_timestamp(val) -> str | None:
    if not val:
        return None
    try:
        if isinstance(val, str):
            dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
        else:
            dt = val
        return to_malaysia(dt).strftime("%d/%m/%Y, %H:%M:%S")
    except Exception:
        return str(val)


@router.get("/login")
@limiter.limit("10/minute")
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
@limiter.limit("10/minute")
async def callback(request: Request, db: AsyncClient = Depends(get_db)):
    """Handle OIDC authorization code callback from Microsoft Entra ID."""
    frontend_base = (settings.allowed_origins.split(",")[0] or "http://localhost:3000").rstrip("/")

    def error_redirect(error_code: str) -> RedirectResponse:
        resp = RedirectResponse(url=f"{frontend_base}/login?error={error_code}", status_code=302)
        resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
        return resp

    # 1. Handle errors returned directly by Microsoft Entra (e.g. user cancelled or consent declined)
    query_error = request.query_params.get("error")
    if query_error:
        error_desc = request.query_params.get("error_description", "")
        logger.warning(f"Entra ID callback returned error: {query_error} ({error_desc})")
        if query_error == "access_denied" or "cancel" in error_desc.lower() or "decline" in error_desc.lower():
            return error_redirect("user_cancelled")
        return error_redirect("auth_failed")

    # 2. Exchange authorization code for token
    try:
        token = await oauth.entra.authorize_access_token(request)
        userinfo = dict(token.get("userinfo") or {})
    except Exception as e:
        err_msg = str(e).lower()
        logger.error(f"OIDC authorization failed: {e}")
        if "mismatching_state" in err_msg or "csrf" in err_msg:
            return error_redirect("session_expired")
        if "access_denied" in err_msg:
            return error_redirect("user_cancelled")
        return error_redirect("auth_failed")

    # 3. User provisioning and tenant validation
    try:
        user = await get_or_create_user(userinfo, db)
    except PermissionError as e:
        err_str = str(e).lower()
        logger.warning(f"SSO PermissionError: {e}")
        if "tenant" in err_str:
            return error_redirect("wrong_tenant")
        return error_redirect("auth_failed")
    except ValueError as e:
        logger.warning(f"SSO ValueError: {e}")
        if "email" in str(e).lower():
            return error_redirect("missing_email")
        return error_redirect("auth_failed")
    except Exception as e:
        logger.error(f"User provisioning failed: {e}")
        return error_redirect("database_unavailable")

    # 4. Save session details into cryptographically signed session cookie
    user_roles = user.roles if user.roles else ["user"]
    last_login_formatted = format_login_timestamp(user.last_login_at)

    request.session["user_id"] = user.email
    request.session["email"] = user.email
    request.session["display_name"] = user.display_name
    request.session["roles"] = user_roles
    request.session["is_active"] = bool(user.is_active)
    request.session["last_login_at"] = last_login_formatted

    # Audit log authentication event in Firestore
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    try:
        await db.collection("auth_events").add({
            "user_email": user.email,
            "event_type": "login_success",
            "ip_address": client_ip,
            "user_agent": user_agent,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.warning(f"Could not write auth audit event to Firestore: {e}")

    frontend_redirect = f"{frontend_base}/"
    response = RedirectResponse(url=frontend_redirect, status_code=302)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
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
@limiter.limit("10/minute")
async def logout(request: Request):
    """Clear local user session and return Entra logout URL."""
    user_email = request.session.get("email") or request.session.get("user_id")
    if user_email:
        try:
            db = get_firestore_client()
            client_ip = request.client.host if request.client else None
            await db.collection("auth_events").add({
                "user_email": user_email,
                "event_type": "logout",
                "ip_address": client_ip,
                "user_agent": request.headers.get("user-agent"),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as e:
            logger.warning(f"Could not record logout event in Firestore: {e}")

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
@limiter.limit("60/minute")
async def me(request: Request, response: Response):
    """Return currently authenticated user directly from cryptographically signed session cookie.

    Bypasses database queries completely for instant 0ms responses.
    """
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
    user_id = request.session.get("user_id") or request.session.get("email")
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

    # 1. Fast-path: read verified data directly from signed Starlette session cookie
    if "roles" in request.session and "email" in request.session:
        return {
            "authenticated": True,
            "user": {
                "id": str(user_id),
                "email": request.session.get("email"),
                "display_name": request.session.get("display_name"),
                "roles": request.session.get("roles") or ["user"],
                "is_active": request.session.get("is_active", True),
                "last_login_at": request.session.get("last_login_at"),
            },
        }

    # 2. Fallback path for legacy session cookies
    try:
        db = get_firestore_client()
        user = await get_current_user_from_session(request, db)
        if not user:
            response.delete_cookie(key="cq_logged_in", path="/")
            return {"authenticated": False, "user": None}

        user_roles = user.roles or ["user"]
        last_login = format_login_timestamp(user.last_login_at)

        request.session["roles"] = user_roles
        request.session["is_active"] = bool(user.is_active)
        request.session["last_login_at"] = last_login

        return {
            "authenticated": True,
            "user": {
                "id": user.email,
                "email": user.email,
                "display_name": user.display_name,
                "roles": user_roles,
                "is_active": user.is_active,
                "last_login_at": last_login,
            },
        }
    except Exception as e:
        logger.error(f"Error resolving user session: {e}")
        response.delete_cookie(key="cq_logged_in", path="/")
        return {"authenticated": False, "user": None}


@router.get("/debug")
@limiter.limit("30/minute")
async def debug_sso_session(request: Request):
    """Debug endpoint returning authenticated session details."""
    return {
        "note": "Raw claims omitted from session cookie to prevent exceeding 4KB browser cookie limit.",
        "authenticated_user_in_session": {
            "id": request.session.get("user_id"),
            "email": request.session.get("email"),
            "display_name": request.session.get("display_name"),
            "roles": request.session.get("roles"),
            "is_active": request.session.get("is_active"),
            "last_login_at": request.session.get("last_login_at"),
        },
    }
