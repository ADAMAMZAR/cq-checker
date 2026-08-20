import logging
from sqlalchemy import text
from app.db.session import get_session_factory

logger = logging.getLogger(__name__)

async def init_db_tables():
    """Ensure document_folders table, RBAC tables, and documents schema exist on startup."""
    factory = get_session_factory()
    async with factory() as session:
        await session.execute(text("""
            CREATE TABLE IF NOT EXISTS document_folders (
                id UUID PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        """))
        await session.execute(text("""
            ALTER TABLE documents 
            ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES document_folders(id) ON DELETE SET NULL;
        """))
        await session.execute(text("""
            ALTER TABLE documents 
            ADD COLUMN IF NOT EXISTS region VARCHAR(20) NOT NULL DEFAULT 'GENERAL';
        """))

        # Auto-classify existing document regions by title
        await session.execute(text("UPDATE documents SET region = 'VN' WHERE (title ILIKE '%vietnam%' OR title ILIKE '%vn%') AND region = 'GENERAL';"))
        await session.execute(text("UPDATE documents SET region = 'TW' WHERE (title ILIKE '%taiwan%' OR title ILIKE '%tw%' OR title LIKE '%台灣%' OR title LIKE '%臺灣%') AND region = 'GENERAL';"))
        await session.execute(text("UPDATE documents SET region = 'MY' WHERE (title ILIKE '%malaysia%' OR title ILIKE '%my%') AND region = 'GENERAL';"))
        await session.execute(text("UPDATE documents SET region = 'AU' WHERE (title ILIKE '%australia%' OR title ILIKE '%au%') AND region = 'GENERAL';"))

        res = await session.execute(text("SELECT COUNT(*) FROM document_folders;"))
        cnt = res.scalar() or 0
        if cnt == 0:
            import uuid
            default_id = str(uuid.uuid4())
            await session.execute(text(
                "INSERT INTO document_folders (id, name) VALUES (:id, 'General') ON CONFLICT DO NOTHING;"
            ), {"id": default_id})
        
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
                route_path VARCHAR(200),
                is_external VARCHAR(1) NOT NULL DEFAULT '0',
                sort_order INTEGER NOT NULL DEFAULT 0
            );
        """))
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
        await session.commit()


