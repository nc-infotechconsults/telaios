"""Pytest configuration and shared fixtures.

DB / HTTP-client / factory fixtures land in Phase 1+.
"""

from __future__ import annotations

import os

import pytest


@pytest.fixture(autouse=True)
def _encryption_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """Provide a deterministic ENCRYPTION_KEY for all unit tests."""
    if not os.environ.get("ENCRYPTION_KEY"):
        monkeypatch.setenv("ENCRYPTION_KEY", "test-only-key-32-bytes-longXXXXXX")
