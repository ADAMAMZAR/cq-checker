import json
import logging
import requests
from typing import List, Dict, Any, Optional
from app.config import settings

logger = logging.getLogger(__name__)

ARIBA_CLIENT_ID = settings.ariba_client_id
ARIBA_CLIENT_SECRET = settings.ariba_client_secret
ARIBA_REALM = settings.ariba_realm
ARIBA_API_KEY = settings.ariba_api_key

def get_oauth_token() -> str:
    """Generates OAuth 2.0 Bearer Token using Client Credentials."""
    url = "https://api.ariba.com/v2/oauth/token"
    payload = {"grant_type": "client_credentials"}
    response = requests.post(url, auth=(settings.ariba_client_id, settings.ariba_client_secret), data=payload)
    response.raise_for_status()
    token = response.json().get("access_token")
    logger.info("[OAuth] Token generated successfully.")
    return token


def step1_get_in_qualification_suppliers(token: str) -> list:
    """Step 1: Find suppliers in 'In Qualification' status."""
    url = f"https://openapi.ariba.com/api/supplierdatapagination/v4/prod/vendorDataRequests/?realm={settings.ariba_realm}"
    headers = {
        "Authorization": f"Bearer {token}",
        "apiKey": settings.ariba_api_key,
        "Content-Type": "application/json",
    }
    body = {"outputFormat": "JSON", "qualificationStatusList": ["InQualification"]}

    response = requests.post(url, headers=headers, json=body)
    response.raise_for_status()
    suppliers = response.json()
    logger.info(f"[Step 1] Found {len(suppliers)} supplier(s) in 'InQualification' status.")
    return suppliers


def get_ariba_suppliers() -> List[Dict[str, Any]]:
    """Step 1 Search API: Fetches live suppliers in 'InQualification' status from Ariba.
    Returns empty list gracefully if credentials are not configured or request fails.
    """
    if not (settings.ariba_client_id and settings.ariba_client_secret and settings.ariba_api_key):
        logger.warning("Ariba credentials not configured in .env. Skipping Ariba search.")
        return []

    try:
        token = get_oauth_token()
        raw_suppliers = step1_get_in_qualification_suppliers(token)

        parsed = []
        if isinstance(raw_suppliers, list):
            for s in raw_suppliers:
                sm_id = str(s.get("SM Vendor ID") or s.get("smVendorId") or s.get("vendorId") or "").strip()
                name = str(s.get("Organization Name") or s.get("name") or s.get("supplierName") or sm_id).strip()
                if sm_id or name:
                    parsed.append({
                        "sm_vendor_id": sm_id,
                        "supplier_name": name,
                        "qualification_status": s.get("qualificationStatus", "InQualification"),
                        "raw_data": s,
                    })
        return parsed
    except Exception as e:
        logger.error(f"Failed to fetch Ariba Step 1 suppliers: {e}")
        return []


def step2_get_questionnaire_doc_id(token: str, sm_vendor_id: str) -> Optional[str]:
    """Step 2: Retrieve the Questionnaire Document ID (docId)."""
    url = f"https://openapi.ariba.com/api/supplierdatapagination/v4/prod/vendors/{sm_vendor_id}/workspaces/questionnaires?realm={settings.ariba_realm}"
    headers = {"Authorization": f"Bearer {token}", "apiKey": settings.ariba_api_key}

    response = requests.get(url, headers=headers)
    if response.status_code == 421:
        logger.info(f"[Step 2] Vendor {sm_vendor_id} has no submitted questionnaires yet.")
        return None

    response.raise_for_status()
    data = response.json()

    questionnaire_list = (
        data.get("_embedded", {}).get("questionnaireList", [])
    )
    if not questionnaire_list:
        logger.info(f"[Step 2] No questionnaires found for vendor {sm_vendor_id}.")
        return None

    first_item = questionnaire_list[0]
    doc_id = (
        first_item.get("questionnaire", {}).get("docId")
        or first_item.get("questionnaireApi", {}).get("docId")
    )
    logger.info(f"[Step 2] Found docId: {doc_id} for Vendor: {sm_vendor_id}")
    return doc_id


def step3_get_questionnaire_answers(token: str, sm_vendor_id: str, doc_id: str) -> dict:
    """Step 3: Extract all typed inputs, certificate metadata, and file info."""
    url = f"https://openapi.ariba.com/api/supplierdatapagination/v4/prod/vendors/{sm_vendor_id}/workspaces/questionnaires/{doc_id}/qna/versions?realm={settings.ariba_realm}"
    headers = {"Authorization": f"Bearer {token}", "apiKey": settings.ariba_api_key}

    response = requests.get(url, headers=headers)
    response.raise_for_status()
    answers_data = response.json()
    logger.info(f"[Step 3] Extracted questionnaire versions & answers for docId: {doc_id}")
    return answers_data


def audit_ariba_supplier(sm_vendor_id: str) -> Dict[str, Any]:
    """Steps 2 & 3 Execution API: Triggered when user clicks 'Audit' in Audit Tab.
    Retrieves doc_id and questionnaire Q&A data for the given SM Vendor ID.
    """
    if not (settings.ariba_client_id and settings.ariba_client_secret and settings.ariba_api_key):
        raise ValueError("Ariba API credentials are not configured in .env.")

    token = get_oauth_token()

    # Step 2
    doc_id = step2_get_questionnaire_doc_id(token, sm_vendor_id)
    if not doc_id:
        return {
            "status": "error",
            "message": f"No submitted questionnaires found for vendor {sm_vendor_id}.",
            "sm_vendor_id": sm_vendor_id,
        }

    # Step 3
    qna_data = step3_get_questionnaire_answers(token, sm_vendor_id, doc_id)
    return {
        "status": "success",
        "sm_vendor_id": sm_vendor_id,
        "doc_id": doc_id,
        "qna_data": qna_data,
    }


# Main Execution Pipeline
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    # Test Step 1
    ariba_list = get_ariba_suppliers()
    print(f"\n--- [Test Step 1] Retrieved {len(ariba_list)} supplier(s) ---")
    for s in ariba_list[:3]:
        print(f"  • {s['supplier_name']} (SM ID: {s['sm_vendor_id']})")

    if ariba_list:
        target = ariba_list[0]
        sm_vendor_id = target["sm_vendor_id"]
        print(f"\n--- [Test Steps 2 & 3] Processing Vendor: {sm_vendor_id} ---")
        res = audit_ariba_supplier(sm_vendor_id)
        print("Response status:", res.get("status"))
        if res.get("doc_id"):
            print("Found Doc ID:", res.get("doc_id"))
