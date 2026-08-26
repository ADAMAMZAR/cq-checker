"""Script to restore a specific user (or default adamamzar@gamuda.com.my) to the 'admin' role."""
import sys
import asyncio
from sqlalchemy import select, delete
from app.db.session import get_session_factory
from app.models.tables import User, Role, UserRole

async def main(target_email: str):
    target_email = target_email.strip().lower()
    factory = get_session_factory()
    async with factory() as db:
        res = await db.execute(select(User).where(User.email.ilike(target_email)))
        user = res.scalar_one_or_none()
        if not user:
            print(f"User with email '{target_email}' not found in database.")
            return

        admin_role_res = await db.execute(select(Role).where(Role.name == "admin"))
        admin_role = admin_role_res.scalar_one_or_none()
        if not admin_role:
            print("Admin role 'admin' not found in database.")
            return

        # Remove current user roles for target user
        await db.execute(delete(UserRole).where(UserRole.user_id == user.id))
        
        # Assign 'admin' role
        db.add(UserRole(user_id=user.id, role_id=admin_role.id))
        await db.commit()
        
        print(f"Successfully granted 'admin' role to '{user.email}' only!")

if __name__ == "__main__":
    email = sys.argv[1] if len(sys.argv) > 1 else "adamamzar@gamuda.com.my"
    asyncio.run(main(email))
