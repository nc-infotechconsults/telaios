"""
domain/agents
-------------
Vendor-agnostic agent implementations.

Public API::

    from domain.agents import DocumentCopilot, DocumentCopilotPhase
"""

from telaios.domain.agents.document_copilot import DocumentCopilot, DocumentCopilotPhase

__all__ = [
    "DocumentCopilot",
    "DocumentCopilotPhase",
]
