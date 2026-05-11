"""Repositories module public facade."""

from telaios.modules.repositories.router import repositories_router
from telaios.modules.repositories.service import RepositoryService

__all__ = ["RepositoryService", "repositories_router"]
