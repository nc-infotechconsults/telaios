"""AES-256-CBC encrypt / decrypt with scrypt-derived key.

Wire-compatible port of ``data-api/src/utils/crypto.util.ts``.

Format: ``<iv_hex>:<ciphertext_hex>`` (PKCS#7 padding).

Key derivation matches Node.js ``crypto.scryptSync(KEY, "salt", 32)``:
  - N = 16384, r = 8, p = 1, dklen = 32, salt = b"salt"

The legacy TS code raises at import if ``ENCRYPTION_KEY`` is unset; we match
that behavior, but lazily so tests can configure the env var first.

API::

    from telaios.utils.crypto import encrypt, decrypt

    ciphertext = encrypt("secret")
    assert decrypt(ciphertext) == "secret"
    assert decrypt("") == ""
    assert decrypt("garbage") == ""  # never raises
"""

from __future__ import annotations

import hashlib
import os
import secrets

from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

_KEY_LEN = 32
_IV_LEN = 16
_SALT = b"salt"

# Cached derived key. Reset by tests via :func:`_reset`.
_DERIVED_KEY: bytes | None = None


def _derive_key() -> bytes:
    global _DERIVED_KEY
    if _DERIVED_KEY is not None:
        return _DERIVED_KEY

    source = os.environ.get("ENCRYPTION_KEY", "")
    if not source:
        raise ValueError("ENCRYPTION_KEY environment variable is required")

    _DERIVED_KEY = hashlib.scrypt(
        source.encode("utf-8"),
        salt=_SALT,
        n=16384,
        r=8,
        p=1,
        dklen=_KEY_LEN,
    )
    return _DERIVED_KEY


def _reset() -> None:
    """Reset cached key (test-only)."""
    global _DERIVED_KEY
    _DERIVED_KEY = None


def encrypt(text: str | None) -> str:
    """Encrypt ``text`` with AES-256-CBC; return ``iv_hex:ciphertext_hex``.

    Returns ``""`` for falsy input.
    """
    if not text:
        return ""
    key = _derive_key()
    iv = secrets.token_bytes(_IV_LEN)
    padder = padding.PKCS7(algorithms.AES.block_size).padder()
    padded = padder.update(text.encode("utf-8")) + padder.finalize()
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    encryptor = cipher.encryptor()
    ct = encryptor.update(padded) + encryptor.finalize()
    return iv.hex() + ":" + ct.hex()


def decrypt(text: str | None) -> str:
    """Decrypt ``iv_hex:ciphertext_hex`` produced by :func:`encrypt`.

    Returns ``""`` for any failure (missing input, malformed, wrong key, etc.).
    Never raises.
    """
    if not text:
        return ""
    try:
        iv_hex, ct_hex = text.split(":", 1)
        if not iv_hex or not ct_hex:
            return ""
        iv = bytes.fromhex(iv_hex)
        ct = bytes.fromhex(ct_hex)
        if len(iv) != _IV_LEN:
            return ""
        key = _derive_key()
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
        decryptor = cipher.decryptor()
        padded = decryptor.update(ct) + decryptor.finalize()
        unpadder = padding.PKCS7(algorithms.AES.block_size).unpadder()
        plaintext = unpadder.update(padded) + unpadder.finalize()
        return plaintext.decode("utf-8")
    except Exception:
        return ""


__all__ = ["decrypt", "encrypt"]
