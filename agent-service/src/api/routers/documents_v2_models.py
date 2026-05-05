"""Request models for enhanced document routes."""

from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel


class ConvertRequest(BaseModel):
    target_format: str


class ExtractRequest(BaseModel):
    schema_: Dict[str, Any]
    focus: Optional[str] = None


class SummarizeRequest(BaseModel):
    level: str = "brief"
    focus: Optional[str] = None


class CompareRequest(BaseModel):
    other_document_id: str
    mode: str = "text"
