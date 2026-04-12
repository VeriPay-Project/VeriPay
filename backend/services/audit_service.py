"""
Audit logging service.

log_event() is the single entry point. It NEVER raises — audit logging
must never break the main operation it wraps.
"""

import logging
from datetime import datetime
from typing import Optional

from fastapi import Request
from sqlalchemy.orm import Session

from models.audit_log import AuditLog

logger = logging.getLogger(__name__)


def log_event(
    db: Session,
    action: str,
    user_id: Optional[int] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    details: Optional[dict] = None,
    request: Optional[Request] = None,
) -> None:
    """
    Append an immutable audit record.

    Parameters
    ----------
    db            : Active SQLAlchemy session (caller's session — no separate commit needed).
    action        : Short verb describing what happened, e.g. "login_success", "upload_invoice".
    user_id       : ID of the acting user, or None for system/unauthenticated events.
    resource_type : Entity type affected, e.g. "invoice", "vendor", "bank_binding".
    resource_id   : String representation of the affected entity's PK.
    details       : Free-form dict with action-specific metadata (risk level, error, etc.).
    request       : FastAPI Request object — used to extract IP and User-Agent if available.
    """
    try:
        ip_address = None
        user_agent = None

        if request is not None:
            # X-Forwarded-For is set by reverse proxies; fall back to direct client IP.
            forwarded_for = request.headers.get("x-forwarded-for")
            ip_address = (
                forwarded_for.split(",")[0].strip()
                if forwarded_for
                else getattr(request.client, "host", None)
            )
            user_agent = request.headers.get("user-agent")

        entry = AuditLog(
            timestamp=datetime.utcnow(),
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            details=details,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        db.add(entry)
        db.flush()   # write within the caller's transaction; caller commits

    except Exception as exc:
        # Audit failure must never surface to the user or abort the main operation.
        logger.error("Audit log failed (action=%s user_id=%s): %s", action, user_id, exc)
