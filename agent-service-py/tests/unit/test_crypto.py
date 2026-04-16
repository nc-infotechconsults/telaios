"""
Unit tests for the crypto module (AES-256-CBC encrypt/decrypt).
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "src"))

import pytest


def test_encrypt_decrypt_roundtrip():
    from agent_service.crypto import encrypt, decrypt

    plaintext = "super-secret-token-abc123"
    ciphertext = encrypt(plaintext)
    assert ":" in ciphertext
    assert ciphertext != plaintext
    assert decrypt(ciphertext) == plaintext


def test_encrypt_produces_different_iv_each_time():
    from agent_service.crypto import encrypt

    ct1 = encrypt("hello")
    ct2 = encrypt("hello")
    # IVs are random, so ciphertexts differ even for the same plaintext
    assert ct1 != ct2


def test_decrypt_empty_string():
    from agent_service.crypto import decrypt

    assert decrypt("") == ""
    assert decrypt(None) == ""


def test_decrypt_invalid_format():
    from agent_service.crypto import decrypt

    assert decrypt("nocolon") == ""
    assert decrypt("badhex:badhex") == ""


def test_decrypt_empty_fields():
    from agent_service.crypto import decrypt

    assert decrypt(":") == ""


def test_roundtrip_unicode():
    from agent_service.crypto import encrypt, decrypt

    text = "こんにちは — emoji 🚀 — résumé"
    assert decrypt(encrypt(text)) == text


def test_roundtrip_long_text():
    from agent_service.crypto import encrypt, decrypt

    long_text = "a" * 5000
    assert decrypt(encrypt(long_text)) == long_text
