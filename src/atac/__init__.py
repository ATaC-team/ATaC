"""ATaC package."""

from __future__ import annotations

from atac.runtime_context import ToolExecutionContext, get_runtime_context
from atac.service import AtacService

_GLOBAL_SERVICE: AtacService | None = None


def set_service(service: AtacService | None) -> None:
    """Set the global ATaC service instance used by wrappers."""
    global _GLOBAL_SERVICE
    _GLOBAL_SERVICE = service


def get_service() -> AtacService | None:
    """Return the global ATaC service instance."""
    return _GLOBAL_SERVICE

__all__ = [
    "AtacService",
    "ToolExecutionContext",
    "get_runtime_context",
    "get_service",
    "set_service",
]
