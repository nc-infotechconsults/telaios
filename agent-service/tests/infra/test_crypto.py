"""tests/infra/test_crypto.py — Tests for infra.crypto encryption/decryption."""

from __future__ import annotations

import os

import pytest


@pytest.fixture(autouse=True)
def _set_encryption_key(monkeypatch):
    """Set a known ENCRYPTION_KEY for all tests and reset the cached key."""
    monkeypatch.setenv("ENCRYPTION_KEY", "test-secret-key-12345")
    # Reset the lazy-loaded key so each test starts fresh
    import telaios.utils.crypto

    telaios.utils.crypto._reset()


class TestEncryptDecrypt:
    """AES-256-CBC encrypt/decrypt roundtrip tests."""

    def test_roundtrip_short_string(self):
        from telaios.utils import decrypt, encrypt

        original = "hello world"
        encrypted = encrypt(original)
        assert encrypted != original
        assert decrypt(encrypted) == original

    def test_roundtrip_empty_string(self):
        from telaios.utils import decrypt, encrypt

        original = ""
        encrypted = encrypt(original)
        assert decrypt(encrypted) == original

    def test_roundtrip_unicode(self):
        from telaios.utils import decrypt, encrypt

        original = "café résumé 日本語"
        encrypted = encrypt(original)
        assert decrypt(encrypted) == original

    def test_roundtrip_long_string(self):
        from telaios.utils import decrypt, encrypt

        original = "x" * 10_000
        encrypted = encrypt(original)
        assert decrypt(encrypted) == original

    def test_encrypted_format_is_iv_hex_colon_ciphertext_hex(self):
        from telaios.utils import encrypt

        encrypted = encrypt("test")
        parts = encrypted.split(":")
        assert len(parts) == 2
        iv_hex, ct_hex = parts
        # IV is 16 bytes = 32 hex chars
        assert len(iv_hex) == 32
        # Ciphertext must be valid hex
        bytes.fromhex(iv_hex)
        bytes.fromhex(ct_hex)

    def test_different_encryptions_produce_different_ciphertext(self):
        from telaios.utils import encrypt

        e1 = encrypt("same")
        e2 = encrypt("same")
        # IVs are random, so ciphertexts should differ
        assert e1 != e2


class TestDecryptEdgeCases:
    """Decrypt should never raise — always return a string."""

    def test_decrypt_none_returns_empty(self):
        from telaios.utils import decrypt

        assert decrypt(None) == ""

    def test_decrypt_empty_string_returns_empty(self):
        from telaios.utils import decrypt

        assert decrypt("") == ""

    def test_decrypt_garbage_returns_empty(self):
        from telaios.utils import decrypt

        assert decrypt("not-valid-ciphertext") == ""

    def test_decrypt_wrong_format_returns_empty(self):
        from telaios.utils import decrypt

        assert decrypt("no-colon-separator") == ""

    def test_decrypt_wrong_key_returns_empty(self):
        """Decrypting with a different key should fail gracefully."""
        from telaios.utils import decrypt, encrypt

        encrypted = encrypt("secret")
        # Change the key
        import telaios.utils.crypto

        telaios.utils.crypto._reset()
        os.environ["ENCRYPTION_KEY"] = "different-key"
        assert decrypt(encrypted) == ""


class TestMissingKey:
    """ENCRYPTION_KEY must be set."""

    def test_missing_key_raises_value_error(self, monkeypatch):
        monkeypatch.delenv("ENCRYPTION_KEY", raising=False)
        import telaios.utils.crypto

        telaios.utils.crypto._reset()
        with pytest.raises(ValueError, match="ENCRYPTION_KEY"):
            telaios.utils.crypto.encrypt("test")
