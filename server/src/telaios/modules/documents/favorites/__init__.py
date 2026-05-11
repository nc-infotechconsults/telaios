"""modules/documents/favorites public facade."""

from telaios.modules.documents.favorites.router import (
    document_favorites_router,
    project_favorites_router,
)
from telaios.modules.documents.favorites.schemas import FavoriteRead
from telaios.modules.documents.favorites.service import FavoriteService

__all__ = [
    "FavoriteRead",
    "FavoriteService",
    "document_favorites_router",
    "project_favorites_router",
]
