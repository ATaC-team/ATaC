"""LangGraph tool adapter."""

from __future__ import annotations

import asyncio
import inspect
from typing import Any

from atac.runtime_context import bind_runtime_context


class LangGraphToolAdapter:
    """Wrap LangGraph/LCEL-like tools exposing invoke/ainvoke."""

    def __init__(self, tool: Any) -> None:
        self.tool = tool

    def invoke(self, args: dict[str, Any], context: dict[str, Any]) -> Any:
        with bind_runtime_context(context):
            return self._call_tool(args)

    def _call_tool(self, args: dict[str, Any]) -> Any:
        ainvoke = getattr(self.tool, "ainvoke", None)
        if callable(ainvoke):
            return self._run_async(ainvoke(args))

        invoke = getattr(self.tool, "invoke", None)
        if callable(invoke):
            return invoke(args)

        if callable(self.tool):
            return self.tool(args)

        raise TypeError("LangGraph tool must provide invoke/ainvoke or be callable")

    def _run_async(self, awaitable: Any) -> Any:
        if not inspect.isawaitable(awaitable):
            return awaitable
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(awaitable)
        if loop.is_running():
            raise RuntimeError("Cannot invoke async tool while an event loop is already running")
        return asyncio.run(awaitable)
