"""Request schemas for document extraction endpoints.

Re-exports the shared LLM request models from document_llm.schemas so
the router only needs to import from this module.
"""

from telaios.modules.document_llm.schemas import (
    CompareRequest,
    ConvertRequest,
    ExtractRequest,
    SummarizeRequest,
)

__all__ = ["CompareRequest", "ConvertRequest", "ExtractRequest", "SummarizeRequest"]
