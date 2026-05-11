"""modules/documents public facade."""

from telaios.modules.documents.activities.router import (
    document_activities_router,
    project_activities_router,
)
from telaios.modules.documents.comments.router import document_comments_router
from telaios.modules.documents.favorites.router import (
    document_favorites_router,
    project_favorites_router,
)
from telaios.modules.documents.folders.router import project_folders_router
from telaios.modules.documents.router import document_router, project_documents_router
from telaios.modules.documents.schemas import DocumentPatch, DocumentRead, PresignedDownloadResponse
from telaios.modules.documents.service import DocumentService
from telaios.modules.documents.tags.router import document_tags_router, project_tags_router
from telaios.modules.documents.templates.router import project_templates_router, templates_router
from telaios.modules.documents.versions.router import document_versions_router

__all__ = [
    "DocumentPatch",
    "DocumentRead",
    "DocumentService",
    "PresignedDownloadResponse",
    "document_activities_router",
    "document_comments_router",
    "document_favorites_router",
    "document_router",
    "document_tags_router",
    "document_versions_router",
    "project_activities_router",
    "project_documents_router",
    "project_favorites_router",
    "project_folders_router",
    "project_tags_router",
    "project_templates_router",
    "templates_router",
]
