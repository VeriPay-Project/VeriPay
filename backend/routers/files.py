"""
Authenticated static file endpoints.

Replaces the unauthenticated StaticFiles mounts for /preview_cache and /rendered.
Any authenticated user can fetch their own preview/rendered files.
Filename is validated to block path traversal before serving.
"""

import logging
import os

from fastapi import APIRouter, Depends, HTTPException
from starlette.responses import FileResponse

from dependencies import get_current_user
from models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Files"])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREVIEW_CACHE_DIR = os.path.join(BASE_DIR, "preview_cache")
RENDERED_DIR = os.path.join(BASE_DIR, "uploads", "rendered")


def _safe_filename(filename: str) -> str:
    """
    Validate filename to block path traversal attacks.
    Raises HTTPException 400 if the filename contains dangerous characters.
    Returns the basename only.
    """
    if not filename:
        raise HTTPException(status_code=400, detail="Filename is required.")

    # Reject null bytes, directory separators, and parent-dir sequences
    if "\x00" in filename or ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")

    return os.path.basename(filename)


@router.get("/api/previews/{filename}")
def serve_preview(
    filename: str,
    user: User = Depends(get_current_user),
):
    safe_name = _safe_filename(filename)
    file_path = os.path.join(PREVIEW_CACHE_DIR, safe_name)

    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Preview not found.")

    logger.debug("Serving preview %s to user %s", safe_name, user.id)
    return FileResponse(file_path)


@router.get("/api/rendered/{filename}")
def serve_rendered(
    filename: str,
    user: User = Depends(get_current_user),
):
    safe_name = _safe_filename(filename)
    file_path = os.path.join(RENDERED_DIR, safe_name)

    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Rendered file not found.")

    logger.debug("Serving rendered file %s to user %s", safe_name, user.id)
    return FileResponse(file_path)
