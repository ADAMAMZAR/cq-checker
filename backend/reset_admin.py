"""Script to restore a specific user (or default adamamzar@gamuda.com.my) to the 'admin' role in Firestore."""
import asyncio
from datetime import datetime, timezone
import sys

from app.db.session import get_firestore_client


async def main(target_email: str):
    target_email = target_email.strip().lower()
    db = get_firestore_client()
    user_ref = db.collection("users").document(target_email)
    snap = await user_ref.get()
    if not snap.exists:
        print(f"User with email '{target_email}' not found in Firestore. Creating with 'admin' role...")
        await user_ref.set({
            "email": target_email,
            "display_name": target_email.split("@")[0],
            "roles": ["admin"],
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_login_at": None,
        })
    else:
        await user_ref.update({"roles": ["admin"]})
    print(f"Successfully granted 'admin' role to '{target_email}' in Firestore!")


if __name__ == "__main__":
    email = sys.argv[1] if len(sys.argv) > 1 else "adamamzar@gamuda.com.my"
    asyncio.run(main(email))
