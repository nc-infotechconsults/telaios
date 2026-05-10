"""Internal service-to-service API key validation.

Used by the legacy TS middleware to bypass user JWT auth for internal callers
(e.g. agent-service → data-api). Compared with constant-time equality.
"""

from __future__ import annotations

import hmac

from telaios.config.settings import settings


def is_internal_api_key(token: str) -> bool:
    """Return True iff ``token`` matches ``INTERNAL_API_KEY`` (constant-time).

    Returns False if either side is empty so an unset env var cannot be
    bypassed by an empty Bearer token.
    """
    expected = settings.INTERNAL_API_KEY
    if not expected or not token:
        return False
    return hmac.compare_digest(token.encode("utf-8"), expected.encode("utf-8"))


__all__ = ["is_internal_api_key"]
