from enum import StrEnum


class Provider(StrEnum):
    """LLM provider identifiers."""

    OPENAI = "openai"
    ANTHROPIC = "anthropic"
