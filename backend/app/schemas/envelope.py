"""Standardized error envelope and response models for Sentinel Flow API v1."""

from __future__ import annotations

from typing import Any, Generic, TypeVar
from pydantic import BaseModel, Field

DataT = TypeVar("DataT")


class ErrorDetail(BaseModel):
    code: str = Field(description="Machine-readable error classification code (e.g., VALIDATION_ERROR, NOT_FOUND)")
    message: str = Field(description="Human-readable explanation of what went wrong")
    details: Any = Field(default=None, description="Optional structured debug details, field errors, or context")
    request_id: str = Field(description="Unique correlation ID for tracing the request in logs")


class ErrorEnvelope(BaseModel):
    """Standardized API error response format across all v1 routes."""
    error: ErrorDetail
    detail: str | None = Field(default=None, description="Backwards-compatible mirror of error.message")


class SuccessResponse(BaseModel):
    status: str = "ok"
    message: str | None = None
