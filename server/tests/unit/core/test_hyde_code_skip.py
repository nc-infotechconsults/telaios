"""Unit tests for HyDE code-identifier skip logic."""

from __future__ import annotations

import re

import pytest

from telaios.core.knowledge.hyde import _CODE_IDENTIFIER_RE


# ── Regex unit tests (no LLM, no network) ─────────────────────────────────────


class TestCodeIdentifierRegex:
    """Verify _CODE_IDENTIFIER_RE matches code queries and misses prose queries."""

    @pytest.mark.parametrize("query", [
        # Spring-style class names
        "UserService",
        "OrderRepository",
        "PaymentController",
        "SessionManager",
        "RequestHandler",
        "UserServiceImpl",
        "UserFactory",
        "OrderDTO",
        "UserEntity",
        "UserMapper",
        "DatabaseException",
        "ApiConfig",
        "StringUtil",
        "DateHelper",
        # Standard exceptions
        "NullPointerException",
        "StackOverflowError",
        "ClassNotFoundException",
        "IllegalArgumentException",
        # Lowercase exception/error
        "nullPointerException",
        "networkError",
        # Import statements
        "import com.example",
        "import java.util",
        # Class declaration
        "class UserController",
        "class AbstractService",
        # Path-like
        "/api/v1/users",
        "/src/main/java/com",
    ])
    def test_matches_code_identifier(self, query: str):
        assert _CODE_IDENTIFIER_RE.search(query), (
            f"Expected _CODE_IDENTIFIER_RE to match: {query!r}"
        )

    @pytest.mark.parametrize("query", [
        "what does this application do?",
        "explain the authentication flow",
        "how does caching improve performance?",
        "describe the database schema",
        "what are the main features?",
        "how is user data stored?",
    ])
    def test_does_not_match_prose_query(self, query: str):
        assert not _CODE_IDENTIFIER_RE.search(query), (
            f"Expected _CODE_IDENTIFIER_RE to NOT match: {query!r}"
        )


# ── HyDE async skip test ──────────────────────────────────────────────────────


class TestHyDESkipBehavior:
    """Test that HyDE bypasses LLM for code-identifier queries."""

    @pytest.mark.asyncio
    async def test_skip_calls_direct_embed(self):
        """Code-identifier query must skip LLM, call embed_query directly."""
        from unittest.mock import AsyncMock, MagicMock

        from telaios.core.knowledge.hyde import HyDE

        llm = MagicMock()
        llm.ainvoke = AsyncMock()  # must NOT be called

        fake_vector = [0.1, 0.2, 0.3]
        vs = MagicMock()
        vs.embed_query = AsyncMock(return_value=fake_vector)

        hyde = HyDE(llm=llm, vector_store=vs)
        result = await hyde.embed_query("UserService", collection="repositories")

        assert result == fake_vector
        llm.ainvoke.assert_not_called()
        vs.embed_query.assert_called_once_with("UserService", collection="repositories")

    @pytest.mark.asyncio
    async def test_prose_query_calls_llm(self):
        """Prose query must call LLM to generate a hypothetical document."""
        from unittest.mock import AsyncMock, MagicMock

        from langchain_core.messages import AIMessage

        from telaios.core.knowledge.hyde import HyDE

        hypothetical_doc = "A platform that orchestrates AI agents."
        fake_vector = [0.4, 0.5, 0.6]

        llm = MagicMock()
        llm.ainvoke = AsyncMock(return_value=AIMessage(content=hypothetical_doc))

        vs = MagicMock()
        vs.embed_query = AsyncMock(return_value=fake_vector)

        hyde = HyDE(llm=llm, vector_store=vs)
        result = await hyde.embed_query("what does Telaios do?", collection="documents")

        assert result == fake_vector
        llm.ainvoke.assert_called_once()
        # embed_query was called with the hypothetical doc, not the original query
        vs.embed_query.assert_called_once_with(hypothetical_doc, collection="documents")

    @pytest.mark.asyncio
    async def test_llm_failure_falls_back_to_direct_embed(self):
        """On LLM failure, must fall back to direct embedding — no exception raised."""
        from unittest.mock import AsyncMock, MagicMock

        from telaios.core.knowledge.hyde import HyDE

        llm = MagicMock()
        llm.ainvoke = AsyncMock(side_effect=RuntimeError("LLM down"))

        fake_vector = [0.1, 0.2]
        vs = MagicMock()
        vs.embed_query = AsyncMock(return_value=fake_vector)

        hyde = HyDE(llm=llm, vector_store=vs)
        result = await hyde.embed_query("explain the caching layer", collection="documents")

        assert result == fake_vector
        vs.embed_query.assert_called_once_with("explain the caching layer", collection="documents")
