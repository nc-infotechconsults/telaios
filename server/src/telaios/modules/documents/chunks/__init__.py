"""modules/documents/chunks public facade."""

from telaios.modules.documents.chunks.repository import ChunkRepository
from telaios.modules.documents.chunks.service import ChunkService

__all__ = ["ChunkRepository", "ChunkService"]
