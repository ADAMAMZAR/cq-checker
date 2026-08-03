"""Storage abstraction.

Provides a pluggable StorageProvider so the backend can switch between local
disk (dev) and Google Cloud Storage (Phase 8) without touching business logic.
"""

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
