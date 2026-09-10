import logging
from fastapi import APIRouter, Request

from app.auth.seed import FEATURES, ROLES, seed
from app.core.limiter import limiter
from app.db.session import get_firestore_client

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory cache to avoid continuous queries for static roles and features
_cached_roles_features_response = None


@router.get("/api/v1/auth/roles", tags=["Auth & RBAC"])
@router.get("/api/v1/auth/roles/", tags=["Auth & RBAC"])
@router.get("/api/auth/roles", tags=["Auth & RBAC"])
@router.get("/api/auth/roles/", tags=["Auth & RBAC"])
@limiter.limit("60/minute")
async def get_roles_and_features(request: Request):
    global _cached_roles_features_response
    if _cached_roles_features_response is not None:
        return _cached_roles_features_response

    try:
        db = get_firestore_client()
        roles_list = []
        async for doc in db.collection("roles").stream():
            data = doc.to_dict() or {}
            roles_list.append({
                "id": doc.id,
                "name": data.get("name", doc.id),
                "display_name": data.get("display_name", doc.id.capitalize()),
                "feature_ids": data.get("features", []),
            })

        features_list = []
        async for doc in db.collection("features").stream():
            data = doc.to_dict() or {}
            features_list.append({
                "id": doc.id,
                "display_name": data.get("display_name", doc.id),
            })

        if roles_list and features_list:
            _cached_roles_features_response = {"roles": roles_list, "features": features_list}
            return _cached_roles_features_response
    except Exception as e:
        logger.warning(f"Error fetching roles from Firestore: {e}")

    # Fallback to static definitions
    roles_list = [
        {
            "id": r["name"],
            "name": r["name"],
            "display_name": r["display_name"],
            "feature_ids": r.get("features", []),
        }
        for r in ROLES
    ]
    features_list = [
        {
            "id": f["id"],
            "display_name": f["display_name"],
        }
        for f in FEATURES
    ]
    _cached_roles_features_response = {"roles": roles_list, "features": features_list}
    return _cached_roles_features_response


@router.post("/api/v1/auth/seed", tags=["Auth & RBAC"])
@router.post("/api/auth/seed", tags=["Auth & RBAC"])
@limiter.limit("5/minute")
async def trigger_seed(request: Request):
    global _cached_roles_features_response
    await seed()
    _cached_roles_features_response = None
    return {"status": "success", "message": "Roles, features, and test users seeded successfully in Firestore"}
