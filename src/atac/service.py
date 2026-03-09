"""ATaC service object."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from atac.adapters import LangGraphToolAdapter
from atac.runtime_context import ToolExecutionContext, ensure_tool_context
from atac.tools.registry import ToolRegistry
from atac.tools.types import ToolWrapper


class AtacService:
    """Stateful ATaC service composed of a tool registry and graph runner."""

    def __init__(self, registry: ToolRegistry | None = None) -> None:
        self.registry = registry or ToolRegistry()

    def register_tool(self, name: str, wrapper: ToolWrapper) -> None:
        self.registry.register(name, wrapper)

    def register_langgraph_tool(self, name: str, tool: Any) -> None:
        self.registry.register(name, LangGraphToolAdapter(tool))

    def list_tools(self) -> list[str]:
        return self.registry.list_names()

    def tool_call(
        self,
        tool_name: str,
        args: dict[str, Any],
        *,
        context: dict[str, Any] | ToolExecutionContext | None = None,
    ) -> Any:
        wrapper = self.registry.resolve(tool_name)
        tool_context = ensure_tool_context(context)
        if "cwd" not in tool_context:
            tool_context["cwd"] = str(Path.cwd())
        if "inputs" not in tool_context:
            tool_context["inputs"] = {}
        if "step_index" not in tool_context:
            tool_context["step_index"] = -1
        return wrapper.invoke(args, tool_context)

    def load_graph(self, graph_spec: str) -> Any:
        from atac.graph import load_graph_from_spec

        return load_graph_from_spec(graph_spec, self)

    def run_graph(self, graph_spec: str, state: dict[str, Any]) -> Any:
        from atac.graph import invoke_graph

        app = self.load_graph(graph_spec)
        return invoke_graph(app, state)

    async def arun_graph(self, graph_spec: str, state: dict[str, Any]) -> Any:
        from atac.graph import ainvoke_graph

        app = self.load_graph(graph_spec)
        return await ainvoke_graph(app, state)
