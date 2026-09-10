from unittest.mock import MagicMock
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from slowapi.errors import RateLimitExceeded

from app.core.limiter import get_user_or_ip, limiter, rate_limit_exceeded_handler
from app.main import app as main_app


def test_get_user_or_ip_with_corporate_email():
    """Verify rate limiter identifies client by X-User-Email header."""
    request = MagicMock(spec=Request)
    request.headers = {"X-User-Email": "TEST.USER@gamuda.com.my"}
    request.client = MagicMock(host="192.168.1.100")
    
    key = get_user_or_ip(request)
    assert key == "user:test.user@gamuda.com.my"


def test_get_user_or_ip_with_session_cookie():
    """Verify rate limiter identifies client by session email if header is absent."""
    request = MagicMock(spec=Request)
    request.headers = {}
    request.session = {"email": "session.user@gamuda.com.my"}
    request.client = MagicMock(host="192.168.1.100")

    key = get_user_or_ip(request)
    assert key == "user:session.user@gamuda.com.my"


def test_get_user_or_ip_with_forwarded_for():
    """Verify rate limiter extracts first IP from X-Forwarded-For proxy header."""
    request = MagicMock(spec=Request)
    request.headers = {"x-forwarded-for": "203.0.113.195, 70.41.3.18"}
    request.session = {}
    request.client = MagicMock(host="10.0.0.1")

    key = get_user_or_ip(request)
    assert key == "ip:203.0.113.195"


def test_get_user_or_ip_fallback_to_client_host():
    """Verify rate limiter falls back to direct client IP when unauthenticated."""
    request = MagicMock(spec=Request)
    request.headers = {}
    request.session = {}
    request.client = MagicMock(host="172.16.0.42")

    key = get_user_or_ip(request)
    assert key == "ip:172.16.0.42"


def test_rate_limit_exceeded_triggers_429_with_retry_after():
    """Verify hitting rate limit returns HTTP 429, error detail, and Retry-After header."""
    test_app = FastAPI()
    test_app.state.limiter = limiter
    test_app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

    @test_app.get("/rate-limited-endpoint")
    @limiter.limit("2/minute")
    async def sample_endpoint(request: Request):
        return {"status": "ok"}

    client = TestClient(test_app)

    # First 2 requests within limit should succeed
    res1 = client.get("/rate-limited-endpoint", headers={"X-User-Email": "rate.test@gamuda.com.my"})
    assert res1.status_code == 200
    assert res1.json() == {"status": "ok"}

    res2 = client.get("/rate-limited-endpoint", headers={"X-User-Email": "rate.test@gamuda.com.my"})
    assert res2.status_code == 200

    # 3rd request should exceed rate limit
    res3 = client.get("/rate-limited-endpoint", headers={"X-User-Email": "rate.test@gamuda.com.my"})
    assert res3.status_code == 429
    data = res3.json()
    assert "Rate limit exceeded" in data["detail"]
    assert "Rate limit exceeded" in data["error"]
    assert "Retry-After" in res3.headers
    assert int(res3.headers["Retry-After"]) >= 1


def test_hybrid_key_isolation_between_users():
    """Verify user A reaching limit does not affect user B."""
    test_app = FastAPI()
    test_app.state.limiter = limiter
    test_app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

    @test_app.get("/isolated-endpoint")
    @limiter.limit("1/minute")
    async def isolated_endpoint(request: Request):
        return {"user": "ok"}

    client = TestClient(test_app)

    # User A consumes their limit
    res_a1 = client.get("/isolated-endpoint", headers={"X-User-Email": "user_a@gamuda.com.my"})
    assert res_a1.status_code == 200

    res_a2 = client.get("/isolated-endpoint", headers={"X-User-Email": "user_a@gamuda.com.my"})
    assert res_a2.status_code == 429

    # User B should NOT be blocked
    res_b1 = client.get("/isolated-endpoint", headers={"X-User-Email": "user_b@gamuda.com.my"})
    assert res_b1.status_code == 200
    assert res_b1.json() == {"user": "ok"}


def test_main_app_health_check_remains_accessible():
    """Verify production main app root health check works seamlessly with limiter registered."""
    client = TestClient(main_app)
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
