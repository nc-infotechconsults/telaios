"""ID generation utilities.

The legacy TS code uses UUIDv4 stored as ``varchar`` primary keys.
We keep the same convention: UUID4 string, lowercase, no dashes stripped.
"""

from __future__ import annotations

from uuid import UUID, uuid4


def new_id() -> str:
    """Return a new lowercase UUID4 string (e.g. ``'a1b2c3...'``)."""
    return str(uuid4())


def parse_id(value: str) -> UUID:
    """Parse a UUID string, raising :class:`ValueError` if invalid."""
    return UUID(value)


def is_valid_id(value: str) -> bool:
    """Return True if ``value`` is a valid UUID string."""
    try:
        UUID(value)
    except ValueError, AttributeError, TypeError:
        return False
    return True
