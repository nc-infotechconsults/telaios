"""
agent_service/services/document_tools/__init__.py
--------------------------------------------------
Document manipulation tools for agents.

Each tool is a factory function returning an ``ExecutableTool``.
"""

from __future__ import annotations

from agent_service.services.document_tools.extract import (
    make_extract_structured_data_tool,
    make_search_document_tool,
)
from agent_service.services.document_tools.analyze import (
    make_get_document_metadata_tool,
    make_compare_documents_tool,
)
from agent_service.services.document_tools.summarize import (
    make_summarize_document_tool,
)
from agent_service.services.document_tools.qa import (
    make_ask_document_tool,
)
from agent_service.services.document_tools.merge import (
    merge_documents,
)
from agent_service.services.document_tools.split import (
    split_document,
)
from agent_service.services.document_tools.convert import (
    make_convert_document_tool,
)

__all__ = [
    "make_extract_structured_data_tool",
    "make_search_document_tool",
    "make_get_document_metadata_tool",
    "make_compare_documents_tool",
    "make_summarize_document_tool",
    "make_ask_document_tool",
    "merge_documents",
    "split_document",
    "make_convert_document_tool",
]
