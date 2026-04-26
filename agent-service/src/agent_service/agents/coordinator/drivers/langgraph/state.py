from __future__ import annotations

from typing import Optional

from typing_extensions import Annotated, TypedDict


class _CodingState(TypedDict):
    messages: Annotated[list, lambda a, b: a + b]
    workspaces: dict[str, str]
    result: str
    done: bool
    error: Optional[str]
