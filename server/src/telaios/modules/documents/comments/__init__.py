"""modules/documents/comments public facade."""

from telaios.modules.documents.comments.router import document_comments_router
from telaios.modules.documents.comments.schemas import CommentCreate, CommentPatch, CommentRead
from telaios.modules.documents.comments.service import CommentService

__all__ = [
    "CommentCreate",
    "CommentPatch",
    "CommentRead",
    "CommentService",
    "document_comments_router",
]
