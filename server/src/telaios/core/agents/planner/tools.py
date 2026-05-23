"""
core/agents/planner/tools.py — LangChain tool definitions for the planner agent.

Provides a factory ``make_tools(documents_retriever, repositories_retriever)``
that returns a list of ``@tool``-decorated async functions bound to the
supplied :class:`~telaios.core.retriever.Retriever` instances.

Using a factory (closures + ``@tool``) avoids class-level state and keeps
tools as plain async functions that LangGraph's ``ToolNode`` can call directly.

Sources:
  - LangChain tool decorator:
    https://python.langchain.com/docs/concepts/tools/#tool-decorator
  - LangGraph ToolNode with async tools:
    https://langchain-ai.github.io/langgraph/how-tos/tool-calling/
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from langchain_core.tools import tool

if TYPE_CHECKING:
    from telaios.core.retriever import Retriever

_TOP_K = 5


def make_tools(
    documents_retriever: Retriever,
    repositories_retriever: Retriever | None = None,
) -> list[Any]:
    """Build and return the planner tool list.

    Args:
        documents_retriever: HybridRetriever for the ``documents`` collection.
        repositories_retriever: Optional HybridRetriever for ``repositories``.
            When ``None``, ``search_repository`` is omitted from the tool list.

    Returns:
        A list of LangChain ``BaseTool`` instances ready to bind to an LLM.
    """
    from telaios.core.types import RetrievalQuery

    @tool
    async def search_documents(query: str) -> str:
        """Search indexed project documents and return relevant excerpts.

        Use this tool when you need information from design documents,
        specifications, requirements, or other project artefacts.

        Args:
            query: Natural language search query.

        Returns:
            Formatted excerpts from the most relevant documents.
        """
        result = await documents_retriever.aretrieve(RetrievalQuery(text=query, top_k=_TOP_K))
        if not result.chunks:
            return "No relevant documents found."
        parts: list[str] = []
        for i, chunk in enumerate(result.chunks, start=1):
            source = chunk.metadata.get("source", chunk.metadata.get("filename", "unknown"))
            # Wrap content in XML tags — treats retrieved text as data, not instructions.
            parts.append(f"[{i}] {source}\n<content>\n{chunk.content}\n</content>")
        return "\n\n".join(parts)

    tools: list[Any] = [search_documents]

    if repositories_retriever is not None:

        @tool
        async def search_repository(query: str, collection: str | None = None) -> str:
            """Search indexed repository code and return relevant snippets.

            Use this tool when you need information about the existing codebase:
            functions, classes, patterns, dependencies, or architecture.

            Args:
                query: Natural language search query.
                collection: Optional sub-collection name to restrict search scope.
                    Defaults to the main repositories collection.

            Returns:
                Formatted code snippets from the most relevant files.
            """
            filters: dict[str, Any] = {}
            if collection:
                filters["collection"] = collection

            result = await repositories_retriever.aretrieve(
                RetrievalQuery(text=query, top_k=_TOP_K, filters=filters)
            )
            if not result.chunks:
                return "No relevant code found."
            parts: list[str] = []
            for i, chunk in enumerate(result.chunks, start=1):
                path = chunk.metadata.get("path", chunk.metadata.get("source", "unknown"))
                parts.append(f"[{i}] {path}\n<content>\n{chunk.content}\n</content>")
            return "\n\n".join(parts)

        tools.append(search_repository)

    return tools


__all__ = ["make_tools"]
