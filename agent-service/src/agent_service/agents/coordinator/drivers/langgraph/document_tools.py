"""
agent_service/agents/coordinator/drivers/langgraph/document_tools.py
--------------------------------------------------------------------
Build document manipulation tools as LangChain StructuredTool.

Wraps agent_service.services.document_tools factories into
StructuredTool for LangGraph driver integration.
"""

from __future__ import annotations

from typing import Any, List

from langchain_core.tools import StructuredTool


def build_document_tools() -> List[StructuredTool]:
    """Build all document tools as StructuredTool for LangGraph."""
    from agent_service.services.document_tools import (
        make_ask_document_tool,
        make_compare_documents_tool,
        make_convert_document_tool,
        make_extract_structured_data_tool,
        make_get_document_metadata_tool,
        make_search_document_tool,
        make_summarize_document_tool,
        merge_documents,
        split_document,
    )

    tools: List[StructuredTool] = []

    # Convert each ExecutableTool to StructuredTool
    factories = [
        ("extract_structured_data", make_extract_structured_data_tool),
        ("search_document", make_search_document_tool),
        ("get_document_metadata", make_get_document_metadata_tool),
        ("compare_documents", make_compare_documents_tool),
        ("summarize_document", make_summarize_document_tool),
        ("ask_document", make_ask_document_tool),
        ("merge_documents", merge_documents),
        ("split_document", split_document),
        ("convert_document", make_convert_document_tool),
    ]

    for name, factory in factories:
        tool = factory()
        # ExecutableTool.coroutine is async fn(**kwargs) -> str
        # StructuredTool.from_function expects sync or async fn
        coroutine = tool.coroutine

        tools.append(
            StructuredTool.from_function(
                coroutine=coroutine,
                name=tool.name,
                description=tool.description,
            )
        )

    return tools
