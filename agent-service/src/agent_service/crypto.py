from __future__ import annotations

import os
from hashlib import scrypt

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

# Derive a 32-byte AES key using scrypt — same parameters as the TypeScript service.
_encryption_key = os.environ.get("ENCRYPTION_KEY")
if not _encryption_key:
    raise RuntimeError("ENCRYPTION_KEY environment variable is required")
_KEY_SOURCE = _encryption_key.encode()
_KEY = scrypt(_KEY_SOURCE, salt=b"salt", n=16384, r=8, p=1, dklen=32)


def encrypt(text: str) -> str:
    """Encrypt ``text`` with AES-256-CBC. Returns ``iv_hex:ciphertext_hex``."""
    import secrets

    iv = secrets.token_bytes(16)
    cipher = Cipher(algorithms.AES(_KEY), modes.CBC(iv), backend=default_backend())
    encryptor = cipher.encryptor()

    # PKCS7 padding
    data = text.encode("utf-8")
    pad_len = 16 - (len(data) % 16)
    data += bytes([pad_len] * pad_len)

    encrypted = encryptor.update(data) + encryptor.finalize()
    return iv.hex() + ":" + encrypted.hex()


def decrypt(text: str | None) -> str:
    """Decrypt a ``iv_hex:ciphertext_hex`` string. Returns empty string on failure."""
    if not text:
        return ""
    try:
        parts = text.split(":")
        if len(parts) != 2:
            return ""
        iv = bytes.fromhex(parts[0])
        encrypted = bytes.fromhex(parts[1])
        cipher = Cipher(algorithms.AES(_KEY), modes.CBC(iv), backend=default_backend())
        decryptor = cipher.decryptor()
        decrypted = decryptor.update(encrypted) + decryptor.finalize()
        # Remove PKCS7 padding
        pad_len = decrypted[-1]
        return decrypted[:-pad_len].decode("utf-8")
    except Exception:
        return ""
