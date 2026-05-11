"""modules/documents/tags public facade."""

from telaios.modules.documents.tags.router import document_tags_router, project_tags_router
from telaios.modules.documents.tags.schemas import TagCreate, TagPatch, TagRead
from telaios.modules.documents.tags.service import TagService

__all__ = [
    "TagCreate",
    "TagPatch",
    "TagRead",
    "TagService",
    "document_tags_router",
    "project_tags_router",
]
