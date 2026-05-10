"""
infra/crypto.py
---------------
Encrypted API key decryption and encryption.

Uses AES-256-CBC with scrypt key derivation — identical format to the
TypeScript service, so existing encrypted values work without migration.

Format: ``iv_hex:ciphertext_hex`` (hex-encoded IV and ciphertext
separated by a colon).
"""

from __future__ import annotations

import os
import secrets
from hashlib import scrypt as _scrypt

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

_ENV_KEY = "ENCRYPTION_KEY"

# Lazy-loaded derived key — computed once on first use.
_derived_key: bytes | None = None


def _get_key() -> bytes:
    """Derive a 32-byte AES key from the ``ENCRYPTION_KEY`` env var using scrypt.

    Uses the same parameters as the TypeScript service (n=16384, r=8, p=1,
    salt=b"salt") so encrypted values are interoperable.
    """
    global _derived_key  # noqa: PLW0603
    if _derived_key is not None:
        return _derived_key

    raw = os.environ.get(_ENV_KEY, "")
    if not raw:
        raise ValueError(f"{_ENV_KEY} environment variable is required")
    _derived_key = _scrypt(raw.encode(), salt=b"salt", n=16384, r=8, p=1, dklen=32)
    return _derived_key


def decrypt(encrypted_value: str | None) -> str:
    """Decrypt an ``iv_hex:ciphertext_hex`` string.

    Returns an empty string when *encrypted_value* is ``None``, empty, or
    if decryption fails for any reason (bad key, corrupted data, etc.).
    """
    if not encrypted_value:
        return ""
    try:
        parts = encrypted_value.split(":")
        if len(parts) != 2:
            return ""
        iv = bytes.fromhex(parts[0])
        ciphertext = bytes.fromhex(parts[1])
        key = _get_key()
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
        decryptor = cipher.decryptor()
        decrypted = decryptor.update(ciphertext) + decryptor.finalize()
        # Remove PKCS7 padding
        pad_len = decrypted[-1]
        return decrypted[:-pad_len].decode("utf-8")
    except Exception:
        return ""


def encrypt(plain_value: str) -> str:
    """Encrypt *plain_value* with AES-256-CBC.

    Returns ``iv_hex:ciphertext_hex``.
    """
    key = _get_key()
    iv = secrets.token_bytes(16)
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    encryptor = cipher.encryptor()

    # PKCS7 padding
    data = plain_value.encode("utf-8")
    pad_len = 16 - (len(data) % 16)
    data += bytes([pad_len] * pad_len)

    encrypted = encryptor.update(data) + encryptor.finalize()
    return iv.hex() + ":" + encrypted.hex()


def _reset() -> None:
    """Reset the cached key — useful in tests to re-initialize with a new key."""
    global _derived_key  # noqa: PLW0603
    _derived_key = None
