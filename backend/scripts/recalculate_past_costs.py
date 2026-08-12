"""Recalculate past costs in Docker PostgreSQL using $0.30 input / $2.50 output per 1M tokens."""

import asyncio
import logging
from sqlalchemy import text

from app.db.session import get_session_factory

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main():
    factory = get_session_factory()
    async with factory() as session:
        logger.info("Recalculating past costs in Docker PostgreSQL...")

        r1 = await session.execute(text("""
            UPDATE document_evidence 
            SET cost_usd = (input_tokens * 0.30 / 1000000.0) + (output_tokens * 2.50 / 1000000.0)
        """))

        r2 = await session.execute(text("""
            UPDATE chat_logs 
            SET cost_usd = (input_tokens * 0.30 / 1000000.0) + (output_tokens * 2.50 / 1000000.0)
        """))

        r3 = await session.execute(text("""
            UPDATE documents 
            SET cost_usd = (input_tokens * 0.30 / 1000000.0) + (output_tokens * 2.50 / 1000000.0)
        """))

        await session.commit()
        logger.info(
            f"Successfully updated:\n"
            f"  - {r1.rowcount} audit evidence records\n"
            f"  - {r2.rowcount} chatbot query logs\n"
            f"  - {r3.rowcount} document ingestion records"
        )


if __name__ == "__main__":
    asyncio.run(main())
