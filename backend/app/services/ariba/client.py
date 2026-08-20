import json
import logging
import time
from typing import Any, Dict, List, Optional

from app.config import settings
from app.services.ariba.auth import _get_headers, _request_ariba, get_oauth_token

logger = logging.getLogger(__name__)

# Supplier List cache state (5-min TTL)
_cached_suppliers: Optional[List[Dict[str, Any]]] = None
_suppliers_cache_time: float = 0.0


def get_in_qualification_suppliers(token: Optional[str] = None) -> list:
    """Step 1: Find suppliers in 'In Qualification' or Pending Approval status."""
    if token is None:
        token = get_oauth_token()

    url = f"https://openapi.ariba.com/api/supplierdatapagination/v4/prod/vendorDataRequests/?realm={settings.ariba_realm}"
    headers = _get_headers(token)
    auth = None if token else (settings.ariba_client_id, settings.ariba_client_secret)

    body = {
        "outputFormat": "JSON",
        "withQuestionnaire": True,
        "qualificationStatusList": [
            "PendingQualificationApproval",
            "PendingQualificationResubmit",
            "InQualification"
        ]
    }

    logger.info(f"[Step 1] Calling SAP Ariba Endpoint: {url}")
    logger.info(f"[Step 1] Request Headers: Authorization=Bearer {'<token_hidden>' if token else 'None'}, apiKey={settings.ariba_api_key[:6]}..., Content-Type=application/json")
    logger.info(f"[Step 1] Request Body: {json.dumps(body)}")

    response = _request_ariba("POST", url, headers=headers, json_body=body, auth=auth)

    if response.status_code == 401 and token:
        logger.warning("[Step 1] Received 401 Unauthorized. Forcing fresh OAuth token regeneration...")
        token = get_oauth_token(force_refresh=True)
        headers = _get_headers(token)
        auth = None if token else (settings.ariba_client_id, settings.ariba_client_secret)
        response = _request_ariba("POST", url, headers=headers, json_body=body, auth=auth)

    response.raise_for_status()
    suppliers = response.json()
    logger.info(f"[Step 1] Found {len(suppliers)} supplier(s) from Ariba.")
    return suppliers


def get_ariba_suppliers(force_refresh: bool = False) -> List[Dict[str, Any]]:
    """Step 1 Search API: Fetches live suppliers from Ariba with 5-minute in-memory caching."""
    global _cached_suppliers, _suppliers_cache_time

    current_time = time.time()
    if not force_refresh and _cached_suppliers is not None and (current_time - _suppliers_cache_time < 300):
        logger.info(f"[Step 1] Returning cached Ariba supplier list ({len(_cached_suppliers)} items).")
        return _cached_suppliers

    if not (settings.ariba_client_id and settings.ariba_client_secret and settings.ariba_api_key):
        logger.warning("Ariba credentials not configured in .env. Skipping Ariba search.")
        return []

    try:
        token = get_oauth_token()
        raw_suppliers = get_in_qualification_suppliers(token)

        parsed = []
        if isinstance(raw_suppliers, list):
            for s in raw_suppliers:
                sm_id = str(s.get("SM Vendor ID") or s.get("smVendorId") or s.get("vendorId") or "").strip()
                name = str(s.get("Supplier Name") or s.get("Organization Name") or s.get("supplierName") or sm_id).strip()
                if sm_id or name:
                    parsed.append({
                        "sm_vendor_id": sm_id,
                        "supplier_name": name,
                        "qualification_status": s.get("Qualification Status") or s.get("qualificationStatus", "InQualification"),
                        "raw_data": s,
                    })

        _cached_suppliers = parsed
        _suppliers_cache_time = current_time
        logger.info(f"[Step 1] Cached fresh {len(parsed)} suppliers from Ariba.")
        return parsed
    except Exception as e:
        logger.error(f"Failed to fetch Ariba Step 1 suppliers: {e}")
        return _cached_suppliers if _cached_suppliers is not None else []


def get_all_questionnaires(token: Optional[str], sm_vendor_id: str) -> List[Dict[str, Any]]:
    """Step 2: Retrieve ALL questionnaires for a vendor using pagination (&$skip)."""
    if token is None:
        token = get_oauth_token()

    all_questionnaires = []
    page_token = None

    while True:
        url = f"https://openapi.ariba.com/api/supplierdatapagination/v4/prod/vendors/{sm_vendor_id}/workspaces/questionnaires?realm={settings.ariba_realm}"
        if page_token:
            url += f"&$skip={page_token}"

        headers = _get_headers(token)
        auth = None if token else (settings.ariba_client_id, settings.ariba_client_secret)
        response = _request_ariba("GET", url, headers=headers, auth=auth)

        if response.status_code == 401 and token:
            logger.warning("[Step 2] Received 401 Unauthorized. Forcing fresh OAuth token regeneration...")
            token = get_oauth_token(force_refresh=True)
            headers = _get_headers(token)
            auth = None if token else (settings.ariba_client_id, settings.ariba_client_secret)
            response = _request_ariba("GET", url, headers=headers, auth=auth)

        if response.status_code == 421:
            logger.info(f"[Step 2] Vendor {sm_vendor_id} has no submitted questionnaires yet.")
            break

        response.raise_for_status()
        data = response.json()

        items = data.get("_embedded", {}).get("questionnaireList", [])
        for item in items:
            q = item.get("questionnaire") or item.get("questionnaireApi") or {}
            if q:
                status = q.get("status")
                if status and str(status).strip().lower() == "notresponded":
                    logger.info(f"[Step 2] Skipping questionnaire '{q.get('docTitle') or q.get('title')}' ({q.get('questionnaireId') or q.get('docId')}) with status: {status}")
                    continue

                all_questionnaires.append({
                    "questionnaireId": q.get("questionnaireId") or q.get("docId"),
                    "workspaceId": q.get("workspaceId"),
                    "docTitle": q.get("docTitle") or q.get("title") or "Questionnaire",
                    "title": q.get("title"),
                    "status": q.get("status"),
                    "active": q.get("active", True),
                    "hasCertificates": q.get("hasCertificates", False),
                    "hasBeenCompleted": q.get("hasBeenCompleted", False),
                    "isRequired": q.get("isRequired", False),
                    "type": q.get("type"),
                    "timeCreated": q.get("timeCreated"),
                    "timeUpdated": q.get("timeUpdated"),
                    "statusUpdatedDate": q.get("statusUpdatedDate"),
                    "questionnaireSubmissionDate": q.get("questionnaireSubmissionDate"),
                })

        page_token = data.get("pageToken")
        if not page_token:
            break

    logger.info(f"[Step 2] Total {len(all_questionnaires)} questionnaire(s) retrieved for Vendor: {sm_vendor_id}")
    return all_questionnaires


def get_questionnaire_answers(token: Optional[str], sm_vendor_id: str, doc_id: str) -> dict:
    """Step 3: Extract all typed inputs, certificate metadata, and file info."""
    if token is None:
        token = get_oauth_token()

    url = f"https://openapi.ariba.com/api/supplierdatapagination/v4/prod/vendors/{sm_vendor_id}/workspaces/questionnaires/{doc_id}/qna/versions?realm={settings.ariba_realm}"
    headers = _get_headers(token)
    auth = None if token else (settings.ariba_client_id, settings.ariba_client_secret)

    response = _request_ariba("GET", url, headers=headers, auth=auth)

    if response.status_code == 401 and token:
        logger.warning("[Step 3] Received 401 Unauthorized. Forcing fresh OAuth token regeneration...")
        token = get_oauth_token(force_refresh=True)
        headers = _get_headers(token)
        auth = None if token else (settings.ariba_client_id, settings.ariba_client_secret)
        response = _request_ariba("GET", url, headers=headers, auth=auth)

    response.raise_for_status()
    answers_data = response.json()
    logger.info(f"[Step 3] Extracted Q&A data for docId: {doc_id}")
    return answers_data
