import logging
from sqlalchemy import text
from app.db.session import get_session_factory

logger = logging.getLogger(__name__)

async def init_db_tables():
    """Ensure document_folders table, RBAC tables, and documents schema exist on startup."""
    factory = get_session_factory()
    async with factory() as session:
        # Ensure RBAC tables exist for roles & features
        await session.execute(text("""
            CREATE TABLE IF NOT EXISTS roles (
                id UUID PRIMARY KEY,
                name VARCHAR(50) NOT NULL UNIQUE,
                display_name VARCHAR(100) NOT NULL,
                description TEXT
            );
        """))
        await session.execute(text("""
            CREATE TABLE IF NOT EXISTS features (
                id VARCHAR(50) PRIMARY KEY,
                display_name VARCHAR(100) NOT NULL,
                description TEXT,
                route_path TEXT,
                is_external VARCHAR(1) NOT NULL DEFAULT '0',
                sort_order INTEGER NOT NULL DEFAULT 0
            );
        """))
        await session.execute(text("ALTER TABLE features ALTER COLUMN route_path TYPE TEXT;"))
        await session.execute(text("""
            CREATE TABLE IF NOT EXISTS user_roles (
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
                granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                PRIMARY KEY (user_id, role_id)
            );
        """))
        await session.execute(text("""
            CREATE TABLE IF NOT EXISTS role_features (
                role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
                feature_id VARCHAR(50) REFERENCES features(id) ON DELETE CASCADE,
                PRIMARY KEY (role_id, feature_id)
            );
        """))

        # SSO user columns
        await session.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS sso_subject VARCHAR(255);"))
        await session.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS sso_provider VARCHAR(50) DEFAULT 'entra';"))
        await session.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS sso_tenant_id VARCHAR(100);"))
        await session.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;"))
        await session.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;"))

        # Auth events audit log table
        await session.execute(text("""
            CREATE TABLE IF NOT EXISTS auth_events (
                id UUID PRIMARY KEY,
                user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                event_type VARCHAR(50) NOT NULL,
                ip_address VARCHAR(45),
                user_agent TEXT,
                details JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        """))
        await session.commit()


