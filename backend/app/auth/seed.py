"""Seed script: creates roles, features, test users, and role-feature permissions.

Run: cd backend && python -m app.auth.seed
"""
import asyncio
import sys
import os

# Add project root to path so we can import app.*
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from sqlalchemy import select, delete, text
from app.db.session import get_session_factory
from app.models.tables import Role, UserRole, Feature, RoleFeature, User


ROLES = [
    {"name": "admin", "display_name": "Admin", "description": "Full system access including admin console"},
    {"name": "manager", "display_name": "Manager", "description": "Strategic sourcing oversight (Features 1, 2, 3, 5)"},
    {"name": "gpo", "display_name": "GPO", "description": "GPO operations team (Features 2, 3, 4, 5)"},
    {"name": "gpo_lead", "display_name": "GPO Lead", "description": "GPO management, all features"},
    {"name": "user", "display_name": "User", "description": "Standard user access (Features 2, 3, 5)"},
]

FEATURES = [
    {"id": "strategic_insights", "display_name": "Real-Time Strategic Insights", "description": "Financial breakdown, cost impact analysis, and compliance cost metrics portal.", "route_path": "https://app.powerbi.com/groups/me/apps/3df7b712-6082-4f44-80ec-f8ce1adf648c/reports/18a05110-1a5c-47ba-895d-a8a35b769a9c/3d71ecbf3319379490fa?ctid=3661835b-b3f4-4a97-b533-2461d689290c&experience=power-bi", "is_external": "1", "sort_order": 1},
    {"id": "procurement_assistant", "display_name": "Procurement Assistant", "description": "SAP Ariba Procurement Assistant for Vendor Onboarding and Sourcing.", "route_path": "/assistant", "is_external": "0", "sort_order": 2},
    {"id": "supplier_visibility", "display_name": "Real-Time Supplier Visibility", "description": "Deep audit engine, certificate cross-checks, and real-time vendor risk monitoring.", "route_path": "https://app.powerbi.com/groups/me/apps/3df7b712-6082-4f44-80ec-f8ce1adf648c/reports/18a05110-1a5c-47ba-895d-a8a35b769a9c/3d71ecbf3319379490fa?ctid=3661835b-b3f4-4a97-b533-2461d689290c&experience=power-bi", "is_external": "1", "sort_order": 3},
    {"id": "certificate_checker", "display_name": "Certificate Checker", "description": "Manage, update, and resolve supplier certificate data and audit findings.", "route_path": "/checker", "is_external": "0", "sort_order": 4},
    {"id": "e_auction_generator", "display_name": "E-Auction Generator", "description": "Issue and generate official E-Auction Event Information documents & lot structures.", "route_path": "/auction", "is_external": "0", "sort_order": 5},
]

# Role -> list of feature IDs they can access
ROLE_FEATURES = {
    "admin":            ["strategic_insights", "procurement_assistant", "supplier_visibility", "certificate_checker", "e_auction_generator"],
    "manager":          ["strategic_insights", "procurement_assistant", "supplier_visibility", "e_auction_generator"],
    "gpo":              ["procurement_assistant", "supplier_visibility", "certificate_checker", "e_auction_generator"],
    "gpo_lead":         ["strategic_insights", "procurement_assistant", "supplier_visibility", "certificate_checker", "e_auction_generator"],
    "user":             ["procurement_assistant", "supplier_visibility", "e_auction_generator"],
}

TEST_USERS = [
    {"email": "admin@gmail.com", "display_name": "Admin", "roles": ["admin"]},
    {"email": "manager@gmail.com", "display_name": "Manager", "roles": ["manager"]},
    {"email": "gpo@gmail.com", "display_name": "GPO", "roles": ["gpo"]},
    {"email": "gpolead@gmail.com", "display_name": "GPO Lead", "roles": ["gpo_lead"]},
    {"email": "user@gmail.com", "display_name": "User", "roles": ["user"]},
]


async def seed(clear_existing: bool = True):
    factory = get_session_factory()
    async with factory() as session:
        if clear_existing:
            print("Clearing existing RBAC tables for a clean overwrite...")
            await session.execute(delete(RoleFeature))
            await session.execute(delete(UserRole))
            # Delete test users
            test_emails = [u["email"] for u in TEST_USERS] + [
                "admin@gamuda.com", "manager@gamuda.com", "analyst@gamuda.com", "lead@gamuda.com", "viewer@gamuda.com"
            ]
            await session.execute(delete(User).where(User.email.in_(test_emails)))
            await session.execute(delete(Role))
            await session.execute(delete(Feature))
            await session.flush()

        # ── Roles ──────────────────────────────────────────────
        for r in ROLES:
            existing = await session.scalar(select(Role).where(Role.name == r["name"]))
            if not existing:
                session.add(Role(**r))
                print(f"  Created role: {r['name']}")
        await session.flush()

        # ── Features ───────────────────────────────────────────
        for f in FEATURES:
            existing = await session.scalar(select(Feature).where(Feature.id == f["id"]))
            if not existing:
                session.add(Feature(**f))
                print(f"  Created feature: {f['id']}")
        await session.flush()

        # ── Role-Feature permissions ───────────────────────────
        all_roles = {r.name: r for r in (await session.execute(select(Role))).scalars().all()}
        all_features = {f.id: f for f in (await session.execute(select(Feature))).scalars().all()}

        for role_name, feature_ids in ROLE_FEATURES.items():
            if role_name not in all_roles:
                continue
            role = all_roles[role_name]
            for fid in feature_ids:
                if fid not in all_features:
                    continue
                feature = all_features[fid]
                exists = await session.scalar(
                    select(RoleFeature).where(
                        RoleFeature.role_id == role.id,
                        RoleFeature.feature_id == feature.id,
                    )
                )
                if not exists:
                    session.add(RoleFeature(role_id=role.id, feature_id=feature.id))
                    print(f"  Granted {role_name} -> {fid}")
        await session.flush()

        # ── Test Users ─────────────────────────────────────────
        for u in TEST_USERS:
            existing = await session.scalar(select(User).where(User.email == u["email"]))
            if not existing:
                user = User(email=u["email"], display_name=u["display_name"])
                session.add(user)
                await session.flush()
                for role_name in u["roles"]:
                    if role_name in all_roles:
                        role = all_roles[role_name]
                        session.add(UserRole(user_id=user.id, role_id=role.id))
                print(f"  Created user: {u['email']} ({', '.join(u['roles'])})")

        await session.commit()
        print("\nSeed complete!")


if __name__ == "__main__":
    asyncio.run(seed())
