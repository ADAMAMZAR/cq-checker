import mimetypes
import os
from urllib.parse import unquote
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.config import settings

router = APIRouter()

MAX_PROXY_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


@router.get("/api/files/local/{folder}/{filename}", tags=["File Serving"])
def serve_local_file(folder: str, filename: str):
    safe_folder = unquote(folder)
    safe_name = unquote(filename)

    root = os.path.abspath(settings.upload_dir)
    file_path = os.path.realpath(os.path.join(root, safe_folder, safe_name))
    if not file_path.startswith(root + os.sep) or not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Not found.")

    stat = os.stat(file_path)
    if stat.st_size > MAX_PROXY_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large.")

    content_type = mimetypes.guess_type(safe_name)[0] or "application/octet-stream"
    with open(file_path, "rb") as f:
        body = f.read()
    return Response(
        content=body,
        media_type=content_type,
        headers={
            "Content-Disposition": f'inline; filename="{safe_name}"',
            "Access-Control-Allow-Origin": "*",
        },
    )
