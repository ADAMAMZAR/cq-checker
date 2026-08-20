"""Script to clean up document titles in Neon PostgreSQL by stripping file extensions (.pdf, .pptx, .docx, etc.)."""

import asyncio
import logging
import re
from sqlalchemy import text

from app.db.session import get_session_factory

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Pattern matching common document file extensions at the end of title
EXTENSION_PATTERN = re.compile(r'\.(pdf|pptx|docx|doc|ppt|xlsx|xls|png|jpg|jpeg|txt|md)$', re.IGNORECASE)


def clean_title(title: str) -> str:
    cleaned = title.strip()
    while EXTENSION_PATTERN.search(cleaned):
        cleaned = EXTENSION_PATTERN.sub('', cleaned).strip()
    return cleaned


async def main():
    factory = get_session_factory()
    async with factory() as session:
        logger.info("Fetching all documents from Neon PostgreSQL...")
        result = await session.execute(text('SELECT id, title FROM documents'))
        rows = result.fetchall()

        updated_count = 0
        for doc_id, old_title in rows:
            new_title = clean_title(old_title)
            if new_title != old_title:
                await session.execute(
                    text('UPDATE documents SET title = :new_title WHERE id = :doc_id'),
                    {"new_title": new_title, "doc_id": doc_id}
                )
                logger.info(f"Updated document {doc_id}: '{old_title}' ➔ '{new_title}'")
                updated_count += 1

        await session.commit()
        logger.info(f"Clean-up completed! Total updated document titles: {updated_count} of {len(rows)}")


if __name__ == "__main__":
    asyncio.run(main())
