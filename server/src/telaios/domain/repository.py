"""Repository abstract base class — contracts for data access.

All concrete repositories implement this interface, enabling:
- Testability (swap real DB repos with in-memory fakes)
- Contract clarity (every module provides the same CRUD surface)
- Liskov substitutability

Type parameter ``T`` is the domain entity (a Pydantic ``BaseModel``),
**not** the SQLAlchemy ORM class.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from pydantic import BaseModel


class AbstractRepository[T: BaseModel](ABC):
    """Generic repository contract for a single aggregate root.

    Concrete implementations handle persistence (SQLAlchemy, in-memory, etc.)
    and translate between the storage format and the domain entity ``T``.
    """

    @abstractmethod
    async def find(self, id: object) -> T | None:
        """Find a single entity by its identifier."""
        ...

    @abstractmethod
    async def save(self, entity: T) -> T:
        """Persist an entity (insert or update). Returns the persisted entity."""
        ...

    @abstractmethod
    async def delete(self, id: object) -> None:
        """Permanently remove an entity."""
        ...
