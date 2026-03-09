"""ATaC service object."""

from __future__ import annotations

from collections.abc import Callable
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
        self._agents: dict[str, Any] = {}

    def register_tool(self, name: str, wrapper: ToolWrapper) -> None:
        self.registry.register(name, wrapper)

    def register_langgraph_tool(self, name: str, tool: Any) -> None:
        self.registry.register(name, LangGraphToolAdapter(tool))

    def register_langgraph_tools(
        self,
        tools: list[Any],
        *,
        prefix: str | None = None,
        include: set[str] | None = None,
        exclude: set[str] | None = None,
        name_mapper: Callable[[str], str] | None = None,
    ) -> list[str]:
        include_set = include or set()
        exclude_set = exclude or set()

        registered_names: list[str] = []
        for tool in tools:
            raw_name = _resolve_langgraph_tool_name(tool)
            if include_set and raw_name not in include_set:
                continue
            if raw_name in exclude_set:
                continue
            register_name = _build_register_name(
                raw_name=raw_name,
                prefix=prefix,
                name_mapper=name_mapper,
            )
            self.register_langgraph_tool(register_name, tool)
            registered_names.append(register_name)
        return registered_names

    def list_tools(self) -> list[str]:
        return self.registry.list_names()

    def register_agent(self, name: str, agent: Any) -> None:
        normalized = _validate_runtime_binding_name(name, kind="Agent")
        if not (
            callable(getattr(agent, "invoke", None))
            or callable(getattr(agent, "ainvoke", None))
            or callable(agent)
        ):
            raise TypeError("Agent must provide invoke/ainvoke or be callable")
        self._agents[normalized] = agent

    def get_agent(self, name: str = "default") -> Any:
        normalized = _validate_runtime_binding_name(name, kind="Agent")
        try:
            return self._agents[normalized]
        except KeyError as exc:
            raise KeyError(f"Agent '{normalized}' is not registered") from exc

    def list_agents(self) -> list[str]:
        return sorted(self._agents.keys())

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


def _resolve_langgraph_tool_name(tool: Any) -> str:
    tool_name = getattr(tool, "name", None)
    if not isinstance(tool_name, str) or not tool_name.strip():
        raise ValueError("Each LangGraph tool must expose a non-empty 'name' attribute")

    if not (
        callable(getattr(tool, "invoke", None))
        or callable(getattr(tool, "ainvoke", None))
        or callable(tool)
    ):
        raise TypeError("LangGraph tool must provide invoke/ainvoke or be callable")

    return tool_name


def _validate_runtime_binding_name(name: str, *, kind: str) -> str:
    if not isinstance(name, str) or not name.strip():
        raise ValueError(f"{kind} name must be a non-empty string")
    return name.strip()


def _build_register_name(
    *,
    raw_name: str,
    prefix: str | None,
    name_mapper: Callable[[str], str] | None,
) -> str:
    mapped = name_mapper(raw_name) if name_mapper else raw_name
    if not isinstance(mapped, str) or not mapped.strip():
        raise ValueError("Mapped tool name must be a non-empty string")
    if prefix:
        return f"{prefix}.{mapped}"
    return mapped
