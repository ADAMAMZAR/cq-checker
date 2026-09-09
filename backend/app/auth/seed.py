"""Seed script: creates pruned roles, features, and test users in Firebase Firestore.

Run: cd backend && python -m app.auth.seed
"""
import asyncio
from datetime import datetime, timezone
import os
import sys

# Add project root to path so we can import app.*
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from app.db.session import get_firestore_client


ROLES = [
    {
        "name": "admin",
        "display_name": "Admin",
        "features": [
            "strategic_insights",
            "procurement_assistant",
            "supplier_visibility",
            "certificate_checker",
            "e_auction_generator",
        ],
    },
    {
        "name": "gpo_admin",
        "display_name": "GPO Admin",
        "features": [
            "strategic_insights",
            "procurement_assistant",
            "supplier_visibility",
            "certificate_checker",
            "e_auction_generator",
        ],
    },
    {
        "name": "management",
        "display_name": "Management",
        "features": [
            "strategic_insights",
            "procurement_assistant",
            "supplier_visibility",
            "e_auction_generator",
        ],
    },
    {
        "name": "manager",
        "display_name": "Manager",
        "features": [
            "strategic_insights",
            "procurement_assistant",
            "supplier_visibility",
            "e_auction_generator",
        ],
    },
    {
        "name": "gpo",
        "display_name": "GPO",
        "features": [
            "procurement_assistant",
            "supplier_visibility",
            "certificate_checker",
            "e_auction_generator",
        ],
    },
    {
        "name": "gpo_lead",
        "display_name": "GPO Lead",
        "features": [
            "strategic_insights",
            "procurement_assistant",
            "supplier_visibility",
            "certificate_checker",
            "e_auction_generator",
        ],
    },
    {
        "name": "user",
        "display_name": "User",
        "features": [
            "procurement_assistant",
            "supplier_visibility",
            "e_auction_generator",
        ],
    },
]

FEATURES = [
    {
        "id": "strategic_insights",
        "display_name": "Automating Real-Time Strategic Insights",
    },
    {
        "id": "procurement_assistant",
        "display_name": "24/7 Autonomous Procurement Assistant",
    },
    {
        "id": "supplier_visibility",
        "display_name": "Providing Real-Time Supplier Visibility",
    },
    {
        "id": "certificate_checker",
        "display_name": "Automating Supplier Compliance Audits",
    },
    {
        "id": "e_auction_generator",
        "display_name": "E-Auction Generator",
    },
]

TEST_USERS = [
    {"email": "adamamzar@gamuda.com.my", "display_name": "Adam Amzar", "roles": ["admin"]},
    {"email": "admin@gmail.com", "display_name": "Admin User", "roles": ["admin"]},
    {"email": "gpo_admin@gamuda.com.my", "display_name": "GPO Admin", "roles": ["gpo_admin"]},
    {"email": "management@gamuda.com.my", "display_name": "Management", "roles": ["management"]},
    {"email": "gpo@gmail.com", "display_name": "GPO Operations", "roles": ["gpo"]},
    {"email": "user@gmail.com", "display_name": "Standard User", "roles": ["user"]},
]


async def seed(clear_existing: bool = False):
    """Seed roles, features, and initial test users into Firestore."""
    db = get_firestore_client()
    now_iso = datetime.now(timezone.utc).isoformat()

    # ── Roles ──────────────────────────────────────────────
    for r in ROLES:
        role_ref = db.collection("roles").document(r["name"])
        await role_ref.set(r, merge=True)
        print(f"  Synced role: {r['name']}")

    # ── Features ───────────────────────────────────────────
    for f in FEATURES:
        feat_ref = db.collection("features").document(f["id"])
        await feat_ref.set(f, merge=True)
        print(f"  Synced feature: {f['id']}")

    # ── Test Users ─────────────────────────────────────────
    for u in TEST_USERS:
        email = u["email"].lower().strip()
        user_ref = db.collection("users").document(email)
        snap = await user_ref.get()
        if not snap.exists:
            await user_ref.set({
                "email": email,
                "display_name": u["display_name"],
                "roles": u["roles"],
                "sso_subject": None,
                "is_active": True,
                "created_at": now_iso,
                "last_login_at": None,
            })
            print(f"  Created user: {email} ({', '.join(u['roles'])})")
        else:
            print(f"  User {email} already exists, skipping overwrite.")

    print("\nFirestore seed complete!")


if __name__ == "__main__":
    asyncio.run(seed())
