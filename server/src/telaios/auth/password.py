"""Password hashing utilities — bcrypt (cost factor 12, matches legacy TS).

Wire-compatible with hashes produced by ``bcryptjs`` in legacy ``data-api/``.
"""

from __future__ import annotations

import bcrypt

_ROUNDS = 12


def hash_password(plain: str) -> str:
    """Hash ``plain`` with bcrypt (12 rounds). Returns the encoded string."""
    salt = bcrypt.gensalt(rounds=_ROUNDS)
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Return True iff ``plain`` matches ``hashed``. Never raises on bad input."""
    if not plain or not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError, TypeError:
        return False


__all__ = ["hash_password", "verify_password"]
