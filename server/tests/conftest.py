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


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    """Skip tests marked `live` unless LIVE_LLM_TESTS=1 is set in the environment."""
    if os.environ.get("LIVE_LLM_TESTS") == "1":
        return
    skip = pytest.mark.skip(reason="live LLM test — set LIVE_LLM_TESTS=1 to run")
    for item in items:
        if item.get_closest_marker("live"):
            item.add_marker(skip)
