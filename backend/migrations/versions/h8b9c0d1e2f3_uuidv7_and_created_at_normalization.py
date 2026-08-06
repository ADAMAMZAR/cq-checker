"""UUID v7 migration for existing records + created_at TIMESTAMPTZ standardization across all tables.

Revision ID: h8b9c0d1e2f3
Revises: g7a8b9c0d1e2
Create Date: 2026-08-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "h8b9c0d1e2f3"
down_revision: Union[str, Sequence[str], None] = "g7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Ensure pgcrypto extension & Create SQL UUID v7 generator function ──
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
    op.execute("""
    CREATE OR REPLACE FUNCTION generate_uuid_v7(p_ts TIMESTAMPTZ DEFAULT clock_timestamp())
    RETURNS uuid AS $$
    DECLARE
        unix_ts_ms BIGINT;
        ts_hex TEXT;
        rand_hex TEXT;
    BEGIN
        unix_ts_ms := FLOOR(EXTRACT(EPOCH FROM COALESCE(p_ts, clock_timestamp())) * 1000);
        ts_hex := lpad(to_hex(unix_ts_ms), 12, '0');
        BEGIN
            rand_hex := encode(gen_random_bytes(10), 'hex');
        EXCEPTION WHEN OTHERS THEN
            rand_hex := encode(uuid_send(gen_random_uuid()), 'hex');
        END;
        RETURN (
            substr(ts_hex, 1, 8) || '-' ||
            substr(ts_hex, 9, 4) || '-' ||
            '7' || substr(rand_hex, 1, 3) || '-' ||
            to_hex((8 + (get_byte(decode(substr(rand_hex, 4, 2), 'hex'), 0) & 3))) || substr(rand_hex, 5, 3) || '-' ||
            substr(rand_hex, 8, 12)
        )::uuid;
    END;
    $$ LANGUAGE plpgsql;
    """)

    # ── 2. Add created_at TIMESTAMPTZ to parent_chunks and child_chunks ───────
    op.execute("ALTER TABLE parent_chunks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()")
    op.execute("ALTER TABLE child_chunks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()")

    # ── 3. Rename date_added -> created_at on suppliers if needed ──────────────
    op.execute("""
    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'suppliers' AND column_name = 'date_added'
        ) THEN
            ALTER TABLE suppliers RENAME COLUMN date_added TO created_at;
        END IF;
    END $$;
    """)

    # ── 4. Ensure document_evidence has created_at and drop timestamp ──────────
    op.execute("ALTER TABLE document_evidence ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ")
    op.execute("""
    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'document_evidence' AND column_name = 'timestamp'
        ) THEN
            UPDATE document_evidence SET created_at = COALESCE(timestamp, now()) WHERE created_at IS NULL;
            ALTER TABLE document_evidence DROP COLUMN timestamp;
        END IF;
    END $$;
    """)
    op.execute("UPDATE document_evidence SET created_at = now() WHERE created_at IS NULL")
    op.execute("ALTER TABLE document_evidence ALTER COLUMN created_at SET NOT NULL")
    op.execute("ALTER TABLE document_evidence ALTER COLUMN created_at SET DEFAULT now()")

    # ── 5. Ensure audit_logs drops legacy timestamp column if present ──────────
    op.execute("""
    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'audit_logs' AND column_name = 'timestamp'
        ) THEN
            ALTER TABLE audit_logs DROP COLUMN timestamp;
        END IF;
    END $$;
    """)

    # ── 6. Migrate existing records to UUID v7 in all tables with UUID PKs ───
    op.execute("""
    DO $$
    DECLARE
        rec RECORD;
        new_id UUID;
    BEGIN
        -- 6a. documents & parent_chunks & child_chunks
        FOR rec IN SELECT id, created_at FROM documents WHERE get_byte(uuid_send(id), 6) >> 4 != 7 LOOP
            new_id := generate_uuid_v7(rec.created_at);
            UPDATE parent_chunks SET document_id = new_id WHERE document_id = rec.id;
            UPDATE documents SET id = new_id WHERE id = rec.id;
        END LOOP;

        FOR rec IN SELECT id, created_at FROM parent_chunks WHERE get_byte(uuid_send(id), 6) >> 4 != 7 LOOP
            new_id := generate_uuid_v7(rec.created_at);
            UPDATE child_chunks SET parent_id = new_id WHERE parent_id = rec.id;
            UPDATE parent_chunks SET id = new_id WHERE id = rec.id;
        END LOOP;

        FOR rec IN SELECT id, created_at FROM child_chunks WHERE get_byte(uuid_send(id), 6) >> 4 != 7 LOOP
            UPDATE child_chunks SET id = generate_uuid_v7(rec.created_at) WHERE id = rec.id;
        END LOOP;

        -- 6b. users & chat_sessions & chat_messages & chat_logs
        FOR rec IN SELECT id, created_at FROM users WHERE get_byte(uuid_send(id), 6) >> 4 != 7 LOOP
            new_id := generate_uuid_v7(rec.created_at);
            UPDATE chat_sessions SET user_id = new_id WHERE user_id = rec.id;
            UPDATE users SET id = new_id WHERE id = rec.id;
        END LOOP;

        FOR rec IN SELECT id, created_at FROM chat_sessions WHERE get_byte(uuid_send(id), 6) >> 4 != 7 LOOP
            UPDATE chat_sessions SET id = generate_uuid_v7(rec.created_at) WHERE id = rec.id;
        END LOOP;

        FOR rec IN SELECT id, created_at FROM chat_messages WHERE get_byte(uuid_send(id), 6) >> 4 != 7 LOOP
            UPDATE chat_messages SET id = generate_uuid_v7(rec.created_at) WHERE id = rec.id;
        END LOOP;

        FOR rec IN SELECT id, created_at FROM chat_logs WHERE get_byte(uuid_send(id), 6) >> 4 != 7 LOOP
            UPDATE chat_logs SET id = generate_uuid_v7(rec.created_at) WHERE id = rec.id;
        END LOOP;

        -- 6c. certificate_verifications, query_cache, object_storage, audit_logs, document_evidence
        FOR rec IN SELECT id, created_at FROM certificate_verifications WHERE get_byte(uuid_send(id), 6) >> 4 != 7 LOOP
            UPDATE certificate_verifications SET id = generate_uuid_v7(rec.created_at) WHERE id = rec.id;
        END LOOP;

        FOR rec IN SELECT id, created_at FROM query_cache WHERE get_byte(uuid_send(id), 6) >> 4 != 7 LOOP
            UPDATE query_cache SET id = generate_uuid_v7(rec.created_at) WHERE id = rec.id;
        END LOOP;

        FOR rec IN SELECT id, created_at FROM object_storage WHERE get_byte(uuid_send(id), 6) >> 4 != 7 LOOP
            UPDATE object_storage SET id = generate_uuid_v7(rec.created_at) WHERE id = rec.id;
        END LOOP;

        FOR rec IN SELECT id, created_at FROM audit_logs WHERE get_byte(uuid_send(id), 6) >> 4 != 7 LOOP
            UPDATE audit_logs SET id = generate_uuid_v7(rec.created_at) WHERE id = rec.id;
        END LOOP;

        FOR rec IN SELECT id, created_at FROM document_evidence WHERE get_byte(uuid_send(id), 6) >> 4 != 7 LOOP
            UPDATE document_evidence SET id = generate_uuid_v7(rec.created_at) WHERE id = rec.id;
        END LOOP;
    END $$;
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE parent_chunks DROP COLUMN IF EXISTS created_at")
    op.execute("ALTER TABLE child_chunks DROP COLUMN IF EXISTS created_at")
    op.execute("DROP FUNCTION IF EXISTS generate_uuid_v7(TIMESTAMPTZ)")
