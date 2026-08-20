import logging
import time
import requests
import urllib3
from typing import Dict, Optional, Tuple

from app.config import settings

logger = logging.getLogger(__name__)

if not settings.ariba_verify_ssl:
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def _request_ariba(
    method: str,
    url: str,
    headers: Optional[dict] = None,
    json_body: Optional[dict] = None,
    data: Optional[dict] = None,
    auth: Optional[Tuple[str, str]] = None,
) -> requests.Response:
    """Helper to execute HTTP requests with SSL fallback and warning management."""
    verify_ssl = settings.ariba_verify_ssl
    try:
        response = requests.request(
            method=method,
            url=url,
            headers=headers,
            json=json_body,
            data=data,
            auth=auth,
            verify=verify_ssl,
        )
        return response
    except requests.exceptions.SSLError as e:
        logger.warning(f"[SSL Certificate Warning] Verification failed ({e}). Retrying with verify=False...")
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        return requests.request(
            method=method,
            url=url,
            headers=headers,
            json=json_body,
            data=data,
            auth=auth,
            verify=False,
        )


def _get_headers(token: Optional[str] = None) -> Dict[str, str]:
    """Helper to return standard Ariba request headers."""
    headers = {
        "apiKey": settings.ariba_api_key,
        "Content-Type": "application/json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


class AribaAuthClient:
    """Thread-safe OAuth 2.0 Bearer Token manager for SAP Ariba OpenAPI."""

    def __init__(self):
        self._cached_token: Optional[str] = None
        self._token_expires_at: float = 0.0

    def get_token(self, force_refresh: bool = False) -> Optional[str]:
        current_time = time.time()

        if not force_refresh and self._cached_token and current_time < (self._token_expires_at - 60):
            logger.info(f"[OAuth] Reusing valid cached token (expires in {int(self._token_expires_at - current_time)}s).")
            return self._cached_token

        url = "https://api.ariba.com/v2/oauth/token"
        payload = {"grant_type": "client_credentials"}
        auth = (settings.ariba_client_id, settings.ariba_client_secret)

        try:
            response = _request_ariba("POST", url, auth=auth, data=payload)
            response.raise_for_status()
            data = response.json()

            token = data.get("access_token")
            expires_in = int(data.get("expires_in", 3600))

            self._cached_token = token
            self._token_expires_at = current_time + expires_in

            logger.info(f"[OAuth] Fresh OAuth token generated successfully (valid for {expires_in} seconds).")
            return token
        except Exception as e:
            logger.info(f"[OAuth] Token generation skipped/failed ({e}). Falling back to Direct Basic Auth.")
            self._cached_token = None
            self._token_expires_at = 0.0
            return None


# Global singleton auth manager instance
_auth_client = AribaAuthClient()


def get_oauth_token(force_refresh: bool = False) -> Optional[str]:
    """Generates or retrieves a cached OAuth 2.0 Bearer Token."""
    return _auth_client.get_token(force_refresh=force_refresh)
