"""
planning_service — LangGraph-based project planning session management.

Public API
----------
set_checkpointer  — call once at startup with a LangGraph checkpointer
init_session      — open (or reconnect) a plan session
handle_user_message — resume the graph with the next user turn

Internal helper exposed for tests
----------------------------------
_build_project_context_text  — builds a markdown summary of a project's context dict
"""

from .context import _build_project_context_text
from .service import handle_user_message, init_session, set_checkpointer

__all__ = [
    "set_checkpointer",
    "init_session",
    "handle_user_message",
    "_build_project_context_text",
]
