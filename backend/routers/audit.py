"""
Audit log read endpoint.

Users can query their own audit events only.
No DELETE or UPDATE endpoints exist — audit_logs is append-only.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from dependencies import get_db, get_current_user
from models.audit_log import AuditLog
from models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/audit", tags=["Audit"])


@router.get("/logs")
def get_my_audit_logs(
    action: Optional[str] = Query(None, description="Filter by action type"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return audit log entries for the currently authenticated user."""
    query = db.query(AuditLog).filter(AuditLog.user_id == user.id)

    if action:
        query = query.filter(AuditLog.action == action)

    total = query.count()
    logs = (
        query.order_by(AuditLog.timestamp.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "logs": [
            {
                "id":            entry.id,
                "timestamp":     entry.timestamp,
                "action":        entry.action,
                "resource_type": entry.resource_type,
                "resource_id":   entry.resource_id,
                "details":       entry.details,
                "ip_address":    entry.ip_address,
            }
            for entry in logs
        ],
    }
