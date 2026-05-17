"""tests/unit/core/test_base_agent.py — Unit tests for BaseAgent."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from langchain_core.language_models.fake_chat_models import FakeListChatModel

from telaios.core.agents.base_agent import BaseAgent
from telaios.core.types import LLMConfig

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_real_agent(name: str = "test-agent", responses: list[str] | None = None) -> BaseAgent:
    """Build a BaseAgent using a real FakeListChatModel — no external API calls."""
    fake_llm = FakeListChatModel(responses=responses or ["I can help with that."])

    with patch("telaios.core.agents.base_agent.init_chat_model", return_value=fake_llm):
        return BaseAgent(
            name=name,
            llm_config=LLMConfig(provider="openai", model_name="gpt-4o", api_key="sk-test"),
        )


@pytest.fixture
def llm_config() -> LLMConfig:
    return LLMConfig(provider="openai", model_name="gpt-4o", api_key="sk-test")


@pytest.fixture
def mock_llm() -> MagicMock:
    return MagicMock(name="mock_llm")


@pytest.fixture
def mock_agent() -> MagicMock:
    return MagicMock(name="mock_agent")


class TestBaseAgentInit:
    """BaseAgent initialisation stores config and builds LLM + agent."""

    def test_stores_name(self, llm_config: LLMConfig, mock_llm: MagicMock, mock_agent: MagicMock):
        with (
            patch("telaios.core.agents.base_agent.init_chat_model", return_value=mock_llm),
            patch("telaios.core.agents.base_agent.create_agent", return_value=mock_agent),
        ):
            agent = BaseAgent(name="test-agent", llm_config=llm_config)

        assert agent._name == "test-agent"

    def test_stores_llm_config(
        self, llm_config: LLMConfig, mock_llm: MagicMock, mock_agent: MagicMock
    ):
        with (
            patch("telaios.core.agents.base_agent.init_chat_model", return_value=mock_llm),
            patch("telaios.core.agents.base_agent.create_agent", return_value=mock_agent),
        ):
            agent = BaseAgent(name="test-agent", llm_config=llm_config)

        assert agent._llm_config is llm_config

    def test_agent_type_is_base(
        self, llm_config: LLMConfig, mock_llm: MagicMock, mock_agent: MagicMock
    ):
        with (
            patch("telaios.core.agents.base_agent.init_chat_model", return_value=mock_llm),
            patch("telaios.core.agents.base_agent.create_agent", return_value=mock_agent),
        ):
            agent = BaseAgent(name="test-agent", llm_config=llm_config)

        assert agent._agent_type == "base"

    def test_debug_defaults_to_false(
        self, llm_config: LLMConfig, mock_llm: MagicMock, mock_agent: MagicMock
    ):
        with (
            patch("telaios.core.agents.base_agent.init_chat_model", return_value=mock_llm),
            patch("telaios.core.agents.base_agent.create_agent", return_value=mock_agent),
        ):
            agent = BaseAgent(name="test-agent", llm_config=llm_config)

        assert agent._debug is False

    def test_debug_can_be_set_to_true(
        self, llm_config: LLMConfig, mock_llm: MagicMock, mock_agent: MagicMock
    ):
        with (
            patch("telaios.core.agents.base_agent.init_chat_model", return_value=mock_llm),
            patch("telaios.core.agents.base_agent.create_agent", return_value=mock_agent),
        ):
            agent = BaseAgent(name="test-agent", llm_config=llm_config, debug=True)

        assert agent._debug is True


class TestBaseAgentInitModel:
    """_init_model calls init_chat_model with the correct LLMConfig fields."""

    def test_init_chat_model_called_with_config_fields(
        self, llm_config: LLMConfig, mock_llm: MagicMock, mock_agent: MagicMock
    ):
        with (
            patch(
                "telaios.core.agents.base_agent.init_chat_model", return_value=mock_llm
            ) as mock_init,
            patch("telaios.core.agents.base_agent.create_agent", return_value=mock_agent),
        ):
            BaseAgent(name="test-agent", llm_config=llm_config)

        mock_init.assert_called_once_with(
            provider=llm_config.provider,
            model=llm_config.model_name,
            temperature=llm_config.temperature,
            timeout=llm_config.timeout,
            max_tokens=llm_config.max_tokens,
            api_key=llm_config.api_key,
        )

    def test_llm_is_stored_on_instance(
        self, llm_config: LLMConfig, mock_llm: MagicMock, mock_agent: MagicMock
    ):
        with (
            patch("telaios.core.agents.base_agent.init_chat_model", return_value=mock_llm),
            patch("telaios.core.agents.base_agent.create_agent", return_value=mock_agent),
        ):
            agent = BaseAgent(name="test-agent", llm_config=llm_config)

        assert agent._llm is mock_llm


class TestBaseAgentInitAgent:
    """_init_agent calls create_agent with the LLM, name, and system prompt."""

    def test_create_agent_called_with_llm_and_name(
        self, llm_config: LLMConfig, mock_llm: MagicMock, mock_agent: MagicMock
    ):
        with (
            patch("telaios.core.agents.base_agent.init_chat_model", return_value=mock_llm),
            patch(
                "telaios.core.agents.base_agent.create_agent", return_value=mock_agent
            ) as mock_create,
        ):
            agent = BaseAgent(name="my-agent", llm_config=llm_config)

        mock_create.assert_called_once_with(
            mock_llm, name="my-agent", system_prompt=agent._system_prompt
        )

    def test_agent_is_stored_on_instance(
        self, llm_config: LLMConfig, mock_llm: MagicMock, mock_agent: MagicMock
    ):
        with (
            patch("telaios.core.agents.base_agent.init_chat_model", return_value=mock_llm),
            patch("telaios.core.agents.base_agent.create_agent", return_value=mock_agent),
        ):
            agent = BaseAgent(name="test-agent", llm_config=llm_config)

        assert agent._agent is mock_agent


class TestBaseAgentInstanceProperty:
    """The `instance` property exposes the underlying agent."""

    def test_instance_returns_agent(
        self, llm_config: LLMConfig, mock_llm: MagicMock, mock_agent: MagicMock
    ):
        with (
            patch("telaios.core.agents.base_agent.init_chat_model", return_value=mock_llm),
            patch("telaios.core.agents.base_agent.create_agent", return_value=mock_agent),
        ):
            agent = BaseAgent(name="test-agent", llm_config=llm_config)

        assert agent.instance is mock_agent

    def test_instance_is_same_object_as_internal_agent(
        self, llm_config: LLMConfig, mock_llm: MagicMock, mock_agent: MagicMock
    ):
        with (
            patch("telaios.core.agents.base_agent.init_chat_model", return_value=mock_llm),
            patch("telaios.core.agents.base_agent.create_agent", return_value=mock_agent),
        ):
            agent = BaseAgent(name="test-agent", llm_config=llm_config)

        assert agent.instance is agent._agent


# ---------------------------------------------------------------------------
# Real integration tests — no mocks, real LangGraph agent construction
# ---------------------------------------------------------------------------


class TestBaseAgentReal:
    """End-to-end construction and invocation using FakeListChatModel.

    These tests exercise the real langchain/langgraph call path without any
    external API calls.
    """

    def test_constructs_without_error(self):
        """BaseAgent builds successfully with a real (fake) LLM."""
        agent = _make_real_agent()
        assert agent is not None

    def test_instance_is_compiled_state_graph(self):
        """create_agent returns a LangGraph CompiledStateGraph."""
        from langgraph.graph.state import CompiledStateGraph

        agent = _make_real_agent()
        assert isinstance(agent.instance, CompiledStateGraph)

    def test_instance_has_invoke_method(self):
        """The underlying graph exposes an invoke method."""
        agent = _make_real_agent()
        assert callable(getattr(agent.instance, "invoke", None))

    def test_instance_has_ainvoke_method(self):
        """The underlying graph exposes an async ainvoke method."""
        agent = _make_real_agent()
        assert callable(getattr(agent.instance, "ainvoke", None))

    def test_instance_name_matches_agent_name(self):
        """The compiled graph carries the name passed to BaseAgent."""
        agent = _make_real_agent(name="my-real-agent")
        assert agent.instance.name == "my-real-agent"

    @pytest.mark.asyncio
    async def test_ainvoke_returns_messages(self):
        """Invoking the agent asynchronously returns a messages dict."""
        agent = _make_real_agent(responses=["Sure, I can help!"])
        result = await agent.instance.ainvoke({"messages": [{"role": "user", "content": "Hello"}]})
        assert "messages" in result
        assert len(result["messages"]) >= 1

    @pytest.mark.asyncio
    async def test_ainvoke_response_contains_fake_reply(self):
        """The AI reply content matches the FakeListChatModel response."""
        expected = "Sure, I can help!"
        agent = _make_real_agent(responses=[expected])
        result = await agent.instance.ainvoke({"messages": [{"role": "user", "content": "Hello"}]})
        ai_messages = [
            m for m in result["messages"] if hasattr(m, "content") and m.content == expected
        ]
        assert ai_messages, f"Expected reply '{expected}' not found in {result['messages']}"

    @pytest.mark.asyncio
    async def test_ainvoke_preserves_human_message(self):
        """The human message is included in the output messages list."""
        from langchain_core.messages import HumanMessage

        agent = _make_real_agent(responses=["ok"])
        result = await agent.instance.ainvoke({"messages": [{"role": "user", "content": "ping"}]})
        human_messages = [m for m in result["messages"] if isinstance(m, HumanMessage)]
        assert human_messages
        assert human_messages[0].content == "ping"


class TestBaseAgentRealStream:
    """Streaming tests using FakeListChatModel — no external API calls."""

    @pytest.mark.asyncio
    async def test_astream_yields_at_least_one_chunk(self):
        """astream produces at least one chunk for a single-turn conversation."""
        agent = _make_real_agent(responses=["streaming reply"])
        chunks = [
            chunk
            async for chunk in agent.instance.astream(
                {"messages": [{"role": "user", "content": "Hello"}]}
            )
        ]
        assert len(chunks) >= 1

    @pytest.mark.asyncio
    async def test_astream_chunks_are_dicts(self):
        """Each chunk emitted by astream is a dictionary (LangGraph node update)."""
        agent = _make_real_agent(responses=["streaming reply"])
        async for chunk in agent.instance.astream(
            {"messages": [{"role": "user", "content": "Hello"}]}
        ):
            assert isinstance(chunk, dict)

    @pytest.mark.asyncio
    async def test_astream_final_chunk_contains_ai_message(self):
        """The last chunk contains an AIMessage with the expected reply content."""
        from langchain_core.messages import AIMessage

        expected = "streaming reply"
        agent = _make_real_agent(responses=[expected])
        chunks = [
            chunk
            async for chunk in agent.instance.astream(
                {"messages": [{"role": "user", "content": "Hello"}]}
            )
        ]
        last = chunks[-1]
        node_output = next(iter(last.values()))
        ai_messages = [m for m in node_output["messages"] if isinstance(m, AIMessage)]
        assert ai_messages, "No AIMessage found in the last stream chunk"
        assert ai_messages[-1].content == expected

    @pytest.mark.asyncio
    async def test_astream_events_yields_events(self):
        """astream_events produces a non-empty sequence of events."""
        agent = _make_real_agent(responses=["event reply"])
        events = [
            event
            async for event in agent.instance.astream_events(
                {"messages": [{"role": "user", "content": "Hello"}]},
                version="v2",
            )
        ]
        assert len(events) >= 1

    @pytest.mark.asyncio
    async def test_astream_events_contains_chat_model_events(self):
        """astream_events includes on_chat_model_start and on_chat_model_end events."""
        agent = _make_real_agent(responses=["event reply"])
        event_types = {
            event["event"]
            async for event in agent.instance.astream_events(
                {"messages": [{"role": "user", "content": "Hello"}]},
                version="v2",
            )
        }
        assert "on_chat_model_start" in event_types
        assert "on_chat_model_end" in event_types

    @pytest.mark.asyncio
    async def test_astream_events_contains_chain_events(self):
        """astream_events includes on_chain_start and on_chain_end events."""
        agent = _make_real_agent(responses=["event reply"])
        event_types = {
            event["event"]
            async for event in agent.instance.astream_events(
                {"messages": [{"role": "user", "content": "Hello"}]},
                version="v2",
            )
        }
        assert "on_chain_start" in event_types
        assert "on_chain_end" in event_types


# ---------------------------------------------------------------------------
# Live tests — real LLM API calls
# Skipped by default. Run with: LIVE_LLM_TESTS=1 LLM_API_KEY=<key> pytest
# ---------------------------------------------------------------------------


def _live_llm_config() -> LLMConfig:
    """Build an LLMConfig from environment variables for live tests."""
    import os

    return LLMConfig(
        provider=os.environ.get("LLM_PROVIDER", "openai"),
        model_name=os.environ.get("LLM_MODEL", "gpt-4o-mini"),
        api_key=os.environ.get("LLM_API_KEY", ""),
    )


@pytest.mark.live
class TestBaseAgentLive:
    """Real end-to-end tests against a live LLM provider.

    These tests are skipped in normal CI. To run them locally:

        LIVE_LLM_TESTS=1 LLM_API_KEY=sk-... uv run pytest -m live -v

    Override provider/model via env vars:

        LIVE_LLM_TESTS=1 LLM_PROVIDER=anthropic LLM_MODEL=claude-3-haiku-20240307 \\
            LLM_API_KEY=sk-ant-... uv run pytest -m live -v
    """

    def test_constructs_with_real_provider(self):
        """BaseAgent builds without error using a real provider config."""
        agent = BaseAgent(name="live-agent", llm_config=_live_llm_config())
        assert agent is not None
        assert agent.instance is not None

    @pytest.mark.asyncio
    async def test_ainvoke_returns_non_empty_reply(self):
        """A simple question produces a non-empty AI reply."""
        from langchain_core.messages import AIMessage

        agent = BaseAgent(name="live-agent", llm_config=_live_llm_config())
        result = await agent.instance.ainvoke(
            {"messages": [{"role": "user", "content": "Reply with exactly the word: PONG"}]}
        )

        assert "messages" in result
        ai_messages = [m for m in result["messages"] if isinstance(m, AIMessage)]
        assert ai_messages, "No AIMessage in response"
        assert ai_messages[-1].content.strip(), "AI reply is empty"

    @pytest.mark.asyncio
    async def test_ainvoke_reply_is_string(self):
        """The AI reply content is a non-empty string."""
        from langchain_core.messages import AIMessage

        agent = BaseAgent(name="live-agent", llm_config=_live_llm_config())
        result = await agent.instance.ainvoke(
            {"messages": [{"role": "user", "content": "Say hello."}]}
        )
        ai_messages = [m for m in result["messages"] if isinstance(m, AIMessage)]
        assert isinstance(ai_messages[-1].content, str)
        assert len(ai_messages[-1].content) > 0

    @pytest.mark.asyncio
    async def test_astream_yields_chunks(self):
        """Streaming a real request yields at least one chunk."""
        agent = BaseAgent(name="live-agent", llm_config=_live_llm_config())
        chunks = [
            chunk
            async for chunk in agent.instance.astream(
                {"messages": [{"role": "user", "content": "Say hello."}]}
            )
        ]
        assert len(chunks) >= 1

    @pytest.mark.asyncio
    async def test_astream_final_chunk_has_ai_message(self):
        """The last stream chunk contains an AIMessage with non-empty content."""
        from langchain_core.messages import AIMessage

        agent = BaseAgent(name="live-agent", llm_config=_live_llm_config())
        chunks = [
            chunk
            async for chunk in agent.instance.astream(
                {"messages": [{"role": "user", "content": "Say hello."}]}
            )
        ]
        last = chunks[-1]
        node_output = next(iter(last.values()))
        ai_messages = [m for m in node_output["messages"] if isinstance(m, AIMessage)]
        assert ai_messages, "No AIMessage in final stream chunk"
        assert ai_messages[-1].content.strip()

    @pytest.mark.asyncio
    async def test_astream_events_includes_model_stream_tokens(self):
        """astream_events emits on_chat_model_stream events with token content."""
        agent = BaseAgent(name="live-agent", llm_config=_live_llm_config())
        token_chunks = [
            event["data"]["chunk"].content
            async for event in agent.instance.astream_events(
                {"messages": [{"role": "user", "content": "Say hello."}]},
                version="v2",
            )
            if event["event"] == "on_chat_model_stream"
        ]
        # At least some tokens should have content
        non_empty = [t for t in token_chunks if t]
        assert non_empty, "No token content received from on_chat_model_stream events"
