"""
src/core/providers/langchain/llm.py
------------------------------------
Backward-compatibility shim.  All LLM logic has moved to ``core.llm``.

Import ``build_llm`` and ``LangChainLLM`` from there directly.
"""

from telaios.core.llm import LangChainLLM, LangChainLLM as LLM, _build_chat_model as build_llm_model, build_llm  # noqa: F401

# Keep the public alias ``build_llm`` available at this path so that any
# existing test or caller doing
#   from telaios.core.providers.langchain.llm import build_llm
# continues to work without changes.

__all__ = ["LangChainLLM", "LLM", "build_llm"]
