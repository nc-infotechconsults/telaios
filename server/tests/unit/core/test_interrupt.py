"""tests/core/test_interrupt.py — Tests for LangGraphInterrupt."""

from __future__ import annotations

import pytest

from telaios.core.interrupt import LangGraphInterrupt


def test_langgraph_interrupt_instantiates():
    """LangGraphInterrupt can be instantiated directly."""
    handle = LangGraphInterrupt()
    assert handle is not None
    assert hasattr(handle, "wait_for_resume")
    assert hasattr(handle, "send_interrupt")


def test_langgraph_interrupt_import_from_providers():
    """LangGraphInterrupt is importable from the canonical core.interrupt path."""
    from telaios.core.interrupt import LangGraphInterrupt as LC  # noqa: N814

    assert LC is LangGraphInterrupt


def test_langgraph_interrupt_send_interrupt_raises():
    """send_interrupt raises GraphInterrupt when called outside a graph context."""
    pytest.importorskip("langgraph", reason="Phase 6: langgraph not installed")
    from langgraph.errors import GraphInterrupt

    handle = LangGraphInterrupt()
    with pytest.raises(GraphInterrupt):
        handle.send_interrupt("test message")
