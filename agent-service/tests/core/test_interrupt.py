"""tests/core/test_interrupt.py — Tests for the InterruptHandle ABC."""

from __future__ import annotations

import pytest

from telaios.core.interrupt import InterruptHandle


class TestInterruptHandleABC:
    """Verify InterruptHandle is a proper abstract base class."""

    def test_cannot_instantiate_directly(self):
        """InterruptHandle is abstract — direct instantiation must fail."""
        with pytest.raises(TypeError, match="abstract"):
            InterruptHandle()  # type: ignore[abstract]

    def test_subclass_must_implement_methods(self):
        """A subclass that doesn't implement abstract methods cannot be instantiated."""

        class Incomplete(InterruptHandle):
            pass

        with pytest.raises(TypeError, match="abstract"):
            Incomplete()  # type: ignore[abstract]

    def test_subclass_can_be_instantiated(self):
        """A concrete subclass implementing all methods can be instantiated."""

        class Concrete(InterruptHandle):
            async def wait_for_resume(self):
                return "resumed"

            def send_interrupt(self, message: str) -> None:
                pass

        handle = Concrete()
        assert handle is not None


@pytest.mark.asyncio
async def test_concrete_wait_for_resume():
    """Concrete implementation returns the expected resume value."""

    class MockInterrupt(InterruptHandle):
        def __init__(self):
            self.messages: list[str] = []

        async def wait_for_resume(self):
            return {"decision": "approved"}

        def send_interrupt(self, message: str) -> None:
            self.messages.append(message)

    handle = MockInterrupt()
    handle.send_interrupt("Please review")
    result = await handle.wait_for_resume()

    assert result == {"decision": "approved"}
    assert handle.messages == ["Please review"]


def test_langgraph_interrupt_import():
    """LangGraphInterrupt can be imported and is a subclass of InterruptHandle."""
    from telaios.core.providers.langchain.interrupt import LangGraphInterrupt

    assert issubclass(LangGraphInterrupt, InterruptHandle)


def test_langgraph_interrupt_send_interrupt_raises():
    """send_interrupt raises GraphInterrupt when called outside a graph context."""
    from langgraph.errors import GraphInterrupt

    from telaios.core.providers.langchain.interrupt import LangGraphInterrupt

    handle = LangGraphInterrupt()
    with pytest.raises(GraphInterrupt):
        handle.send_interrupt("test message")
