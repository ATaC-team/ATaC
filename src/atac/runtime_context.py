"""Runtime context helpers for tool execution."""

from __future__ import annotations

import os
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path
from typing import Any


class ToolExecutionContext(dict[str, Any]):
    """User-facing execution context with cwd-aware helpers."""

    @property
    def cwd(self) -> Path:
        raw = self.get("cwd")
        if isinstance(raw, str) and raw.strip():
            return Path(raw)
        return Path.cwd()

    @property
    def workdir(self) -> Path:
        return self.cwd

    def resolve_path(self, path: str | Path) -> Path:
        target = Path(path)
        if target.is_absolute():
            return target
        return self.workdir / target

    def env(self) -> dict[str, str]:
        return os.environ.copy()


_RUNTIME_CONTEXT: ContextVar[ToolExecutionContext | None] = ContextVar(
    "atac_runtime_context",
    default=None,
)


def ensure_tool_context(
    context: dict[str, Any] | ToolExecutionContext | None,
) -> ToolExecutionContext:
    """Normalize raw runtime data into a tool-facing context object."""
    if isinstance(context, ToolExecutionContext):
        return ToolExecutionContext(dict(context))
    return ToolExecutionContext(context or {})


def get_runtime_context() -> ToolExecutionContext:
    """Return current runtime context bound to this execution scope."""
    value = _RUNTIME_CONTEXT.get()
    if value is None:
        return ToolExecutionContext()
    return ToolExecutionContext(dict(value))


@contextmanager
def bind_runtime_context(context: dict[str, Any] | ToolExecutionContext) -> Any:
    """Temporarily bind runtime context for wrapper-managed tool invocation."""
    token = _RUNTIME_CONTEXT.set(ensure_tool_context(context))
    try:
        yield
    finally:
        _RUNTIME_CONTEXT.reset(token)
