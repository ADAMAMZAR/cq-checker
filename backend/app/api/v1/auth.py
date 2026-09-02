import logging
from fastapi import APIRouter
from sqlalchemy import select

from app.auth.seed import FEATURES, ROLE_FEATURES, ROLES, TEST_USERS, seed
from app.db.session import get_session_factory
from app.models.tables import Feature, Role, RoleFeature

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory cache to avoid continuous PostgreSQL queries for static roles and features
_cached_roles_features_response = None


@router.get("/api/v1/auth/roles", tags=["Auth & RBAC"])
@router.get("/api/auth/roles", tags=["Auth & RBAC"])
async def get_roles_and_features():
    global _cached_roles_features_response
    if _cached_roles_features_response is not None:
        return _cached_roles_features_response

    try:
        factory = get_session_factory()
        async with factory() as session:
            roles_db = (await session.execute(select(Role))).scalars().all()
            features_db = (await session.execute(select(Feature))).scalars().all()
            rf_rows = (await session.execute(select(RoleFeature))).scalars().all()

            if roles_db:
                role_features_map = {}
                for rf in rf_rows:
                    role_features_map.setdefault(str(rf.role_id), []).append(rf.feature_id)

                roles_list = []
                for r in roles_db:
                    f_ids = role_features_map.get(str(r.id), ROLE_FEATURES.get(r.name, []))
                    test_u = next((u["email"] for u in TEST_USERS if r.name in u["roles"]), None)
                    roles_list.append({
                        "id": str(r.id),
                        "name": r.name,
                        "display_name": r.display_name,
                        "description": r.description,
                        "feature_ids": f_ids,
                        "test_user": test_u,
                    })

                features_list = [
                    {
                        "id": f.id,
                        "display_name": f.display_name,
                        "description": f.description,
                        "route_path": f.route_path,
                        "is_external": f.is_external == "1",
                        "sort_order": f.sort_order,
                    }
                    for f in features_db
                ]
                _cached_roles_features_response = {"roles": roles_list, "features": features_list}
                return _cached_roles_features_response
    except Exception as e:
        logger.warning(f"Error fetching roles from DB: {e}")

    roles_list = []
    for r in ROLES:
        roles_list.append({
            "name": r["name"],
            "display_name": r["display_name"],
            "description": r["description"],
            "feature_ids": ROLE_FEATURES.get(r["name"], []),
            "test_user": next((u["email"] for u in TEST_USERS if r["name"] in u["roles"]), None),
        })
    _cached_roles_features_response = {"roles": roles_list, "features": FEATURES}
    return _cached_roles_features_response


@router.post("/api/v1/auth/seed", tags=["Auth & RBAC"])
@router.post("/api/auth/seed", tags=["Auth & RBAC"])
async def trigger_seed():
    global _cached_roles_features_response
    await seed()
    _cached_roles_features_response = None
    return {"status": "success", "message": "Roles, features, and test users seeded successfully"}
