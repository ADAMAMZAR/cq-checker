"""Rate limiter configuration and hybrid key resolver using slowapi."""
import logging
import time
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

logger = logging.getLogger(__name__)


def get_user_or_ip(request: Request) -> str:
    """Identify client by corporate email if authenticated, falling back to IP.

    Priority:
    1. X-User-Email corporate header
    2. Active Starlette session cookie
    3. X-Forwarded-For header (Firebase Hosting / Cloud Run reverse proxy)
    4. Client host IP (fallback)
    """
    # 1. Check corporate email header
    user_email = request.headers.get("X-User-Email")
    if user_email and user_email.strip():
        return f"user:{user_email.strip().lower()}"

    # 2. Check active session cookie
    try:
        if hasattr(request, "session"):
            session_email = request.session.get("email") or request.session.get("user_id")
            if session_email and isinstance(session_email, str) and session_email.strip():
                return f"user:{session_email.strip().lower()}"
    except Exception:
        pass

    # 3. Check X-Forwarded-For reverse proxy header
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
        if client_ip:
            return f"ip:{client_ip}"

    # 4. Fallback to direct client host
    return f"ip:{get_remote_address(request)}"


# Central limiter instance (headers_enabled=False to support standard FastAPI dict/model returns)
limiter = Limiter(
    key_func=get_user_or_ip,
    headers_enabled=False,
)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> Response:
    """Handle rate limit violations with standardized JSON response and Retry-After header."""
    client_id = get_user_or_ip(request)
    logger.warning(
        f"Rate limit exceeded for '{client_id}' on {request.method} {request.url.path}: {exc.detail}"
    )

    current_limit = getattr(request.state, "view_rate_limit", None)
    headers = {}
    if current_limit and hasattr(request.app.state, "limiter"):
        try:
            window_stats = request.app.state.limiter.limiter.get_window_stats(
                current_limit[0], *current_limit[1]
            )
            reset_in = max(1, int(1 + window_stats[0] - time.time()))
            headers["Retry-After"] = str(reset_in)
        except Exception:
            headers["Retry-After"] = "60"
    else:
        headers["Retry-After"] = "60"

    content = {
        "detail": f"Rate limit exceeded: {exc.detail}. Please try again later.",
        "error": f"Rate limit exceeded: {exc.detail}",
    }
    return JSONResponse(content=content, status_code=429, headers=headers)
