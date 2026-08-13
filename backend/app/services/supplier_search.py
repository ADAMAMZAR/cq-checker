import json
import logging
import time
import requests
import urllib3
from typing import List, Dict, Any, Optional
from app.config import settings

logger = logging.getLogger(__name__)

if not settings.ariba_verify_ssl:
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Global token cache state
_cached_token: Optional[str] = None
_token_expires_at: float = 0.0


def _request_ariba(
    method: str, 
    url: str, 
    headers: Optional[dict] = None, 
    json_body: Optional[dict] = None, 
    data: Optional[dict] = None, 
    auth: Optional[tuple] = None
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


def get_oauth_token(force_refresh: bool = False) -> Optional[str]:
    """Generates or retrieves a cached OAuth 2.0 Bearer Token.

    - Reuses active token if still valid.
    - Re-generates token automatically if expired or if `force_refresh=True`.
    - Returns None if OAuth fails or Basic Auth is preferred.
    """
    global _cached_token, _token_expires_at

    current_time = time.time()

    # Reuse cached token if valid and not forcing refresh (with 60-second buffer)
    if not force_refresh and _cached_token and current_time < (_token_expires_at - 60):
        logger.info(f"[OAuth] Reusing valid cached token (expires in {int(_token_expires_at - current_time)}s).")
        return _cached_token

    url = "https://api.ariba.com/v2/oauth/token"
    payload = {"grant_type": "client_credentials"}
    auth = (settings.ariba_client_id, settings.ariba_client_secret)
    
    try:
        response = _request_ariba("POST", url, auth=auth, data=payload)
        response.raise_for_status()
        data = response.json()
        
        token = data.get("access_token")
        expires_in = int(data.get("expires_in", 3600))  # Default to 1 hr if not specified
        
        _cached_token = token
        _token_expires_at = current_time + expires_in
        
        logger.info(f"[OAuth] Fresh OAuth token generated successfully (valid for {expires_in} seconds).")
        return token
    except Exception as e:
        logger.info(f"[OAuth] Token generation skipped/failed ({e}). Falling back to Direct Basic Auth.")
        _cached_token = None
        _token_expires_at = 0.0
        return None


def get_in_qualification_suppliers(token: Optional[str] = None) -> list:
    """Step 1: Find suppliers in 'In Qualification' or Pending Approval status.
    Supports OAuth Bearer Token or Direct Basic Auth.
    """
    if token is None:
        token = get_oauth_token()

    url = f"https://openapi.ariba.com/api/supplierdatapagination/v4/prod/vendorDataRequests/?realm={settings.ariba_realm}"
    headers = _get_headers(token)
    auth = None if token else (settings.ariba_client_id, settings.ariba_client_secret)
    
    body = {
        "outputFormat": "JSON",
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
    
    # 401 Unauthorized handling: force token refresh once if expired mid-session
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


# Supplier List cache state (5-min TTL)
_cached_suppliers: Optional[List[Dict[str, Any]]] = None
_suppliers_cache_time: float = 0.0


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

        # 401 Unauthorized handling: force token refresh once
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

        # Pagination check
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

    # 401 Unauthorized handling: force token refresh once
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


def audit_ariba_supplier(sm_vendor_id: str, force_new_token: bool = False) -> Dict[str, Any]:
    """Steps 2 & 3 Execution Pipeline:
    Retrieves all questionnaires and extracts answers for certificate questionnaires.
    Optionally pass force_new_token=True to generate a fresh token specifically for this vendor run.
    """
    if not (settings.ariba_client_id and settings.ariba_client_secret and settings.ariba_api_key):
        raise ValueError("Ariba API credentials are not configured in .env.")

    token = get_oauth_token(force_refresh=force_new_token)

    # Step 2: Retrieve all questionnaires (paginated)
    questionnaires = get_all_questionnaires(token, sm_vendor_id)
    if not questionnaires:
        return {
            "status": "error",
            "message": f"No submitted questionnaires found for vendor {sm_vendor_id}.",
            "sm_vendor_id": sm_vendor_id,
        }

    audit_results = []

    # Process each questionnaire
    for q in questionnaires:
        doc_id = q.get("questionnaireId") or q.get("docId")
        doc_title = q.get("docTitle") or q.get("title") or "Questionnaire"
        has_certs = q.get("hasCertificates", False)

        if not doc_id:
            continue

        # Step 3: Get Q&A / Certificate inputs
        qna_data = get_questionnaire_answers(token, sm_vendor_id, doc_id)

        audit_results.append({
            "doc_id": doc_id,
            "doc_title": doc_title,
            "has_certificates": has_certs,
            "qna_data": qna_data,
        })

    return {
        "status": "success",
        "sm_vendor_id": sm_vendor_id,
        "total_questionnaires": len(questionnaires),
        "audit_results": audit_results,
    }


# Main Execution Pipeline Test
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    print("==================================================")
    print("      Testing SAP Ariba API Integration Flow      ")
    print("==================================================")

    # 1. OAuth / Direct Basic Auth & Step 1: In-Qualification Suppliers
    print("\n--- [Step 1 Endpoint] Fetching In-Qualification Suppliers ---")
    ariba_list = get_ariba_suppliers()
    print(f"Retrieved {len(ariba_list)} supplier(s). Response preview:")
    print(json.dumps(ariba_list[:2], indent=2))

    # 2. Steps 2 & 3: Questionnaire List & Q&A Answers per Vendor
    if ariba_list:
        target_sm_id = ariba_list[0].get("sm_vendor_id") or ariba_list[0].get("supplier_name")
        print(f"\n--- [Steps 2 & 3 Endpoints] Auditing Supplier (SM Vendor ID: {target_sm_id}) ---")
        # Demonstrate force_refresh option if user explicitly wants a fresh token per vendor audit run
        audit_res = audit_ariba_supplier(target_sm_id, force_new_token=True)
        print("Full Audit Pipeline Response:")
        print(json.dumps(audit_res, indent=2))

        # Save complete output to a file for easy inspection
        out_file = "ariba_test_responses.json"
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump({
                "step1_suppliers": ariba_list,
                "supplier_audit_pipeline": audit_res,
            }, f, indent=2)
        print(f"\n✅ All endpoint responses written to '{out_file}'.")
    else:
        print("\n⚠️ No suppliers found or check backend/.env configuration.")