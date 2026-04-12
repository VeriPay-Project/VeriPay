"""
Central rate-limiter instance shared across all routers.

Usage in a router:
    from limiter import limiter
    from fastapi import Request

    @router.post("/some-endpoint")
    @limiter.limit("5/minute")
    def my_endpoint(request: Request, ...):
        ...

The `request` parameter MUST be present in the function signature for
slowapi to detect the client key — even if you don't use it directly.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=[])
