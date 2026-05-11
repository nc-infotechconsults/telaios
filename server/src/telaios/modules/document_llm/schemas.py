"""Request models shared across document LLM operations."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ConvertRequest(BaseModel):
    target_format: str = Field(..., description="Target format: markdown, html, pdf")


class ExtractRequest(BaseModel):
    schema_: dict[str, Any] = Field(..., alias="schema", description="JSON Schema to extract into")
    focus: str | None = Field(default=None, description="Optional extraction focus hint")

    model_config = {"populate_by_name": True}


class SummarizeRequest(BaseModel):
    level: str = Field(default="brief", description="brief | detailed | executive")
    focus: str | None = Field(default=None, description="Optional topic to focus on")


class CompareRequest(BaseModel):
    other_document_id: str = Field(..., description="UUID of the second document")
    mode: str = Field(default="text", description="Comparison mode: text | semantic")


__all__ = ["CompareRequest", "ConvertRequest", "ExtractRequest", "SummarizeRequest"]
