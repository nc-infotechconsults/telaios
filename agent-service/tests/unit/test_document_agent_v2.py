"""
Unit tests for the document copilot v2 agent (T4).

Covers:
- chat() raises RuntimeError before set_checkpointer() is called
- set_checkpointer() compiles the graph (create_react_agent called once)
- chat() invokes the graph with the correct thread_id and returns a reply
- chat() returns structured response with all expected fields
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage


class TestDocumentCopilotV2:
    def setup_method(self):
        """Reset module-level _doc_graph before each test."""
        import agent_service.agents.document_copilot.agent as agent_mod
        agent_mod._doc_graph = None

    @pytest.mark.asyncio
    async def test_chat_raises_when_not_initialised(self):
        from agent_service.agents.document_copilot.agent import chat

        with pytest.raises(RuntimeError, match="not initialised"):
            await chat("proj-1", "doc-1", "sess-1", "hello")

    def test_set_checkpointer_compiles_graph(self):
        fake_checkpointer = MagicMock()
        fake_graph = MagicMock()

        with patch(
            "agent_service.agents.document_copilot.agent.create_react_agent",
            return_value=fake_graph,
        ) as mock_cra:
            # build_chat_model is imported inside set_checkpointer; patch at source
            with patch("agent_service.core.llm.build_chat_model", return_value=MagicMock()):
                from agent_service.agents.document_copilot.agent import set_checkpointer

                set_checkpointer(fake_checkpointer)
                mock_cra.assert_called_once()

    @pytest.mark.asyncio
    async def test_chat_returns_reply_with_correct_fields(self):
        import agent_service.agents.document_copilot.agent as agent_mod

        ai_reply = AIMessage(content="The document is about AI.")
        fake_graph = MagicMock()
        fake_graph.ainvoke = AsyncMock(
            return_value={"messages": [HumanMessage(content="summarise"), ai_reply]}
        )
        agent_mod._doc_graph = fake_graph

        from agent_service.agents.document_copilot.agent import chat

        result = await chat("proj-1", "doc-1", "sess-1", "summarise")

        assert result["reply"] == "The document is about AI."
        assert result["thread_id"] == "doc:proj-1:doc-1:sess-1"
        assert result["project_id"] == "proj-1"
        assert result["document_id"] == "doc-1"
        assert result["session_id"] == "sess-1"

    @pytest.mark.asyncio
    async def test_chat_passes_correct_thread_id_to_graph(self):
        import agent_service.agents.document_copilot.agent as agent_mod

        fake_graph = MagicMock()
        fake_graph.ainvoke = AsyncMock(
            return_value={"messages": [AIMessage(content="ok")]}
        )
        agent_mod._doc_graph = fake_graph

        from agent_service.agents.document_copilot.agent import chat

        await chat("p", "d", "s", "hello")

        call_args = fake_graph.ainvoke.call_args
        config = call_args[0][1] if len(call_args[0]) > 1 else call_args[1].get("config", call_args[0][-1])
        assert config["configurable"]["thread_id"] == "doc:p:d:s"

    @pytest.mark.asyncio
    async def test_different_sessions_use_different_thread_ids(self):
        import agent_service.agents.document_copilot.agent as agent_mod

        captured = []

        async def fake_invoke(input_, config):
            captured.append(config["configurable"]["thread_id"])
            return {"messages": [AIMessage(content="ok")]}

        fake_graph = MagicMock()
        fake_graph.ainvoke = fake_invoke
        agent_mod._doc_graph = fake_graph

        from agent_service.agents.document_copilot.agent import chat

        await chat("p", "d", "sess-A", "hello")
        await chat("p", "d", "sess-B", "hello")

        assert len(set(captured)) == 2
        assert "doc:p:d:sess-A" in captured
        assert "doc:p:d:sess-B" in captured
