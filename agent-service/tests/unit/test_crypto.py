"""
Unit tests for the crypto module (AES-256-CBC encrypt/decrypt).
"""
from __future__ import annotations


def test_encrypt_decrypt_roundtrip():
    from telaios.utils import encrypt, decrypt

    plaintext = "super-secret-token-abc123"
    ciphertext = encrypt(plaintext)
    assert ":" in ciphertext
    assert ciphertext != plaintext
    assert decrypt(ciphertext) == plaintext


def test_encrypt_produces_different_iv_each_time():
    from telaios.utils import encrypt

    ct1 = encrypt("hello")
    ct2 = encrypt("hello")
    # IVs are random, so ciphertexts differ even for the same plaintext
    assert ct1 != ct2


def test_decrypt_empty_string():
    from telaios.utils import decrypt

    assert decrypt("") == ""
    assert decrypt(None) == ""


def test_decrypt_invalid_format():
    from telaios.utils import decrypt

    assert decrypt("nocolon") == ""
    assert decrypt("badhex:badhex") == ""


def test_decrypt_empty_fields():
    from telaios.utils import decrypt

    assert decrypt(":") == ""


def test_roundtrip_unicode():
    from telaios.utils import encrypt, decrypt

    text = "こんにちは — emoji 🚀 — résumé"
    assert decrypt(encrypt(text)) == text


def test_roundtrip_long_text():
    from telaios.utils import encrypt, decrypt

    long_text = "a" * 5000
    assert decrypt(encrypt(long_text)) == long_text
