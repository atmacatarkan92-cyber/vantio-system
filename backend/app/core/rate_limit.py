"""
Central shared rate limiter instance for the API.
"""
import os

from slowapi import Limiter
from slowapi.util import get_remote_address

# Pytest sets PYTEST_VERSION for the whole run (including collection). Disable limits only there so
# TestClient shares one "remote address" and would otherwise hit 429 across the suite. Production
# and normal `uvicorn` runs keep limiting enabled.
_limiter_enabled = os.environ.get("PYTEST_VERSION") is None

limiter = Limiter(key_func=get_remote_address, enabled=_limiter_enabled)
