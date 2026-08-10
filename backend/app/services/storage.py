"""Storage abstraction.

Provides a pluggable StorageProvider so the backend can switch between local
disk (dev) and Google Cloud Storage (Phase 8) without touching business logic.
"""

import hashlib
import logging
import os
from abc import ABC, abstractmethod
from typing import Optional
from urllib.parse import quote

from app.config import settings

logger = logging.getLogger(__name__)


class StorageProvider(ABC):
    @abstractmethod
    def upload(self, file_bytes: bytes, folder: str, filename: str, content_type: str) -> Optional[str]:
        """Upload a file and return its public URL (or None on failure)."""


class LocalDiskStorage(StorageProvider):
    """Dev storage: writes files under UPLOAD_DIR, serves them via /api/files/*."""

    def __init__(self, upload_dir: Optional[str] = None):
        self.upload_dir = upload_dir or settings.upload_dir
        os.makedirs(self.upload_dir, exist_ok=True)

    def upload(self, file_bytes: bytes, folder: str, filename: str, content_type: str) -> Optional[str]:
        try:
            safe_folder = "".join(c for c in folder if c.isalnum() or c in (" ", "_", "-")).strip()
            safe_name = "".join(c for c in filename if c.isalnum() or c in (" ", "_", "-", ".", "(", ")")).strip()
            dir_path = os.path.join(self.upload_dir, safe_folder)
            os.makedirs(dir_path, exist_ok=True)
            file_path = os.path.join(dir_path, safe_name)
            with open(file_path, "wb") as f:
                f.write(file_bytes)
            encoded_folder = quote(safe_folder)
            encoded_name = quote(safe_name)
            return f"/api/files/local/{encoded_folder}/{encoded_name}"
        except Exception as e:
            logger.error(f"Local storage upload exception: {e}")
            return None


# ── Active provider (swap this in Phase 8 to GCSStorage) ─────────────────────

_storage: Optional[StorageProvider] = None


def get_storage() -> StorageProvider:
    global _storage
    if _storage is None:
        _storage = LocalDiskStorage()
    return _storage


async def store_and_record(
    file_bytes: bytes,
    folder: str,
    filename: str,
    content_type: str,
    bucket: Optional[str] = None,
) -> Optional[str]:
    """Upload a file AND record its metadata in ``object_storage``.

    Wrapper around the active StorageProvider that persists (file_url, bucket,
    object_key, content_type, size_bytes, sha256 checksum) so Phase 8 can map
    old URLs to GCS objects. Returns the public URL or None on failure.
    """
    file_url = get_storage().upload(file_bytes, folder, filename, content_type)
    if not file_url:
        return None
    try:
        from app.db.session import get_session_factory
        from app.repositories.object_storage import ObjectStorageRepository

        factory = get_session_factory()
        async with factory() as session:
            repo = ObjectStorageRepository(session)
            existing = await repo.get_by_url(file_url)
            if existing:
                existing.size_bytes = len(file_bytes)
                existing.checksum = hashlib.sha256(file_bytes).hexdigest()
                if content_type:
                    existing.content_type = content_type
                await session.commit()
            else:
                await repo.create(
                    file_url=file_url,
                    bucket=bucket,
                    object_key=file_url,
                    content_type=content_type or None,
                    size_bytes=len(file_bytes),
                    checksum=hashlib.sha256(file_bytes).hexdigest(),
                )
    except Exception as e:
        # Metadata recording is best-effort; do not fail the upload because of it.
        logger.warning(f"Failed to record object metadata for {file_url}: {e}")
    return file_url
