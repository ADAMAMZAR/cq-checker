"""Initialize Firestore database and ensure roles and features are pre-seeded on startup."""
import logging

from app.auth.seed import seed
from app.db.session import get_firestore_client

logger = logging.getLogger(__name__)


async def init_db_tables():
    """Verify Firestore connectivity and auto-seed default roles & features if empty."""
    try:
        db = get_firestore_client()
        roles_stream = db.collection("roles").limit(1).stream()
        has_roles = False
        async for _ in roles_stream:
            has_roles = True
            break

        if not has_roles:
            logger.info("Firestore 'roles' collection is empty. Auto-seeding default roles & features...")
            await seed(clear_existing=False)
        else:
            logger.info("Firestore database connected and verified.")
    except Exception as e:
        logger.warning(f"Could not verify or auto-seed Firestore on startup: {e}")
