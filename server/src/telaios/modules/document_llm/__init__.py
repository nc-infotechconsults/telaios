"""document_llm — LLM utility layer for document operations.

No HTTP surface. Consumed by modules.document_extraction and
modules.document_copilot.
"""

from telaios.modules.document_llm.service import extract_structured_from_chunks, summarize_chunks

__all__ = ["extract_structured_from_chunks", "summarize_chunks"]
