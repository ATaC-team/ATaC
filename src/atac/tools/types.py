"""Core tool types for ATaC runtime."""

from __future__ import annotations

from typing import Any, Protocol

from atac.runtime_context import ToolExecutionContext


class ToolWrapper(Protocol):
    """Adapter protocol that exposes heterogeneous tools to ATaC runtime.

    Wrappers must return the raw tool result unchanged.
    """

    def invoke(self, args: dict[str, Any], context: ToolExecutionContext) -> Any:
        """Invoke the wrapped tool and return raw output."""
