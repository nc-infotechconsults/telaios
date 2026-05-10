"""Tests for telaios.utils.crypto — AES-256-CBC encrypt/decrypt."""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _set_encryption_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """Set a known ENCRYPTION_KEY and reset the cached key for each test."""
    monkeypatch.setenv("ENCRYPTION_KEY", "test-secret-key-12345")
    from telaios.utils import crypto

    crypto._reset()


class TestRoundtrip:
    def test_short_string(self) -> None:
        from telaios.utils import decrypt, encrypt

        assert decrypt(encrypt("hello world")) == "hello world"

    def test_unicode(self) -> None:
        from telaios.utils import decrypt, encrypt

        original = "café résumé 日本語 🚀"
        assert decrypt(encrypt(original)) == original

    def test_long_string(self) -> None:
        from telaios.utils import decrypt, encrypt

        original = "x" * 10_000
        assert decrypt(encrypt(original)) == original

    def test_format_is_iv_hex_colon_ct_hex(self) -> None:
        from telaios.utils import encrypt

        encrypted = encrypt("test")
        iv_hex, ct_hex = encrypted.split(":")
        assert len(iv_hex) == 32  # 16 bytes hex
        bytes.fromhex(iv_hex)
        bytes.fromhex(ct_hex)

    def test_random_iv_per_encryption(self) -> None:
        from telaios.utils import encrypt

        assert encrypt("same") != encrypt("same")


class TestDecryptEdgeCases:
    """Decrypt must never raise."""

    def test_none_returns_empty(self) -> None:
        from telaios.utils import decrypt

        assert decrypt(None) == ""

    def test_empty_returns_empty(self) -> None:
        from telaios.utils import decrypt

        assert decrypt("") == ""

    def test_garbage_returns_empty(self) -> None:
        from telaios.utils import decrypt

        assert decrypt("not-valid") == ""

    def test_no_colon_returns_empty(self) -> None:
        from telaios.utils import decrypt

        assert decrypt("abc") == ""

    def test_wrong_key_returns_empty(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from telaios.utils import crypto, decrypt, encrypt

        encrypted = encrypt("secret")
        crypto._reset()
        monkeypatch.setenv("ENCRYPTION_KEY", "different-key")
        assert decrypt(encrypted) == ""


class TestMissingKey:
    def test_raises_value_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from telaios.utils import crypto

        monkeypatch.delenv("ENCRYPTION_KEY", raising=False)
        crypto._reset()
        with pytest.raises(ValueError, match="ENCRYPTION_KEY"):
            crypto.encrypt("test")
