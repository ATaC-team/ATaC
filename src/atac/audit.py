"""Static graph auditing helpers for ATaC-managed LangGraph source files."""

from __future__ import annotations

import ast
import importlib.util
from pathlib import Path
from typing import Any


def analyze_graph_spec(spec: str) -> dict[str, Any]:
    """Statically analyze a graph module referenced by ``<module>:<attr>`` spec."""
    if ":" not in spec:
        raise ValueError("Graph spec must use '<module_path>:<name>' format")

    module_name, attr_name = spec.split(":", maxsplit=1)
    module_spec = importlib.util.find_spec(module_name)
    if module_spec is None or module_spec.origin is None:
        raise ModuleNotFoundError(f"Cannot resolve module '{module_name}' from graph spec")
    return analyze_graph_file(Path(module_spec.origin), graph_spec=spec, entrypoint=attr_name)


def analyze_graph_file(
    path: str | Path,
    *,
    graph_spec: str | None = None,
    entrypoint: str | None = None,
) -> dict[str, Any]:
    """Statically analyze a LangGraph source file and return an auditable structure."""
    source_path = Path(path).resolve()
    source = source_path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(source_path))
    analyzer = _GraphAuditAnalyzer(
        source=source,
        source_path=source_path,
        graph_spec=graph_spec,
        entrypoint=entrypoint,
    )
    return analyzer.analyze(tree)


class _GraphAuditAnalyzer:
    def __init__(
        self,
        *,
        source: str,
        source_path: Path,
        graph_spec: str | None,
        entrypoint: str | None,
    ) -> None:
        self.source = source
        self.source_path = source_path
        self.graph_spec = graph_spec
        self.entrypoint = entrypoint
        self.function_defs: dict[str, ast.AST] = {}
        self.import_aliases: dict[str, str] = {}

    def analyze(self, tree: ast.Module) -> dict[str, Any]:
        self._index_module(tree)
        builder_name = self.entrypoint or self._infer_builder_name(tree)
        graph_var, state_schema_name, nodes, edges, conditional_edges = self._analyze_builder(
            tree, builder_name
        )
        return {
            "graph_spec": self.graph_spec,
            "source_path": str(self.source_path),
            "entrypoint": builder_name,
            "graph_variable": graph_var,
            "state_schema": state_schema_name,
            "nodes": [self._build_node_payload(node_name, fn_name) for node_name, fn_name in nodes],
            "edges": edges,
            "conditional_edges": conditional_edges,
        }

    def _index_module(self, tree: ast.Module) -> None:
        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                self.function_defs[node.name] = node
            elif isinstance(node, ast.ImportFrom):
                for alias in node.names:
                    imported_name = alias.name
                    as_name = alias.asname or imported_name
                    self.import_aliases[as_name] = imported_name
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    as_name = alias.asname or alias.name
                    self.import_aliases[as_name] = alias.name

    def _infer_builder_name(self, tree: ast.Module) -> str:
        for candidate in ("build_graph", "create_graph"):
            if candidate in self.function_defs:
                return candidate
        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if node.name.startswith("build_"):
                    return node.name
        raise ValueError("Could not infer graph builder function; pass entrypoint explicitly")

    def _analyze_builder(
        self, tree: ast.Module, builder_name: str
    ) -> tuple[str | None, str | None, list[tuple[str, str | None]], list[dict[str, str]], list[dict[str, Any]]]:
        builder = self.function_defs.get(builder_name)
        if builder is None:
            raise ValueError(f"Builder function '{builder_name}' not found in graph source")

        graph_var: str | None = None
        state_schema_name: str | None = None
        nodes: list[tuple[str, str | None]] = []
        edges: list[dict[str, str]] = []
        conditional_edges: list[dict[str, Any]] = []

        for stmt in builder.body:
            if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1 and isinstance(stmt.targets[0], ast.Name):
                target_name = stmt.targets[0].id
                if self._is_state_graph_ctor(stmt.value):
                    graph_var = target_name
                    state_schema_name = self._extract_state_schema(stmt.value)
                    continue
            if graph_var is None:
                continue
            call = self._extract_call(stmt)
            if call is None:
                continue
            if not self._is_graph_method_call(call, graph_var):
                continue
            method_name = call.func.attr
            if method_name == "add_node":
                node_name = self._literal_string(call.args[0]) if call.args else None
                fn_name = self._callable_name(call.args[1]) if len(call.args) > 1 else None
                if node_name:
                    nodes.append((node_name, fn_name))
            elif method_name == "add_edge":
                edge = self._extract_edge(call)
                if edge is not None:
                    edges.append(edge)
            elif method_name == "add_conditional_edges":
                conditional = self._extract_conditional_edge(call)
                if conditional is not None:
                    conditional_edges.append(conditional)

        return graph_var, state_schema_name, nodes, edges, conditional_edges

    def _build_node_payload(self, node_name: str, fn_name: str | None) -> dict[str, Any]:
        function_node = self.function_defs.get(fn_name or "")
        source = ast.get_source_segment(self.source, function_node) if function_node is not None else None
        tool_calls = self._extract_tool_calls(function_node)
        agent_calls = self._extract_agent_calls(function_node)
        nested_graph_calls = [
            call for call in tool_calls if call["tool_name"] == "run_graph"
        ]
        if agent_calls and tool_calls:
            kind = "mixed"
        elif agent_calls:
            kind = "agent"
        elif tool_calls:
            kind = "tool"
        else:
            kind = "logic"
        return {
            "id": node_name,
            "callable": fn_name,
            "kind": kind,
            "is_async": isinstance(function_node, ast.AsyncFunctionDef),
            "source": source,
            "tool_calls": tool_calls,
            "agent_calls": agent_calls,
            "nested_graph_calls": nested_graph_calls,
        }

    def _extract_tool_calls(self, function_node: ast.AST | None) -> list[dict[str, Any]]:
        if function_node is None:
            return []
        results: list[dict[str, Any]] = []
        for node in ast.walk(function_node):
            if not isinstance(node, ast.Call):
                continue
            if not self._is_service_method_call(node, "tool_call"):
                continue
            tool_name = self._literal_string(node.args[0]) if node.args else None
            arg_keys: list[str] = []
            if len(node.args) > 1 and isinstance(node.args[1], ast.Dict):
                for key in node.args[1].keys:
                    literal_key = self._literal_string(key)
                    if literal_key is not None:
                        arg_keys.append(literal_key)
            results.append(
                {
                    "tool_name": tool_name,
                    "line": getattr(node, "lineno", None),
                    "arg_keys": arg_keys,
                }
            )
        return results

    def _extract_agent_calls(self, function_node: ast.AST | None) -> list[dict[str, Any]]:
        if function_node is None:
            return []
        results: list[dict[str, Any]] = []
        for node in ast.walk(function_node):
            if not isinstance(node, ast.Call):
                continue
            if not self._is_service_method_call(node, "get_agent"):
                continue
            results.append(
                {
                    "agent_name": self._literal_string(node.args[0]) if node.args else "default",
                    "line": getattr(node, "lineno", None),
                }
            )
        return results

    def _extract_edge(self, call: ast.Call) -> dict[str, str] | None:
        if len(call.args) < 2:
            return None
        source = self._edge_endpoint(call.args[0])
        target = self._edge_endpoint(call.args[1])
        if source is None or target is None:
            return None
        return {"source": source, "target": target}

    def _extract_conditional_edge(self, call: ast.Call) -> dict[str, Any] | None:
        if len(call.args) < 2:
            return None
        source = self._edge_endpoint(call.args[0])
        router_name = self._callable_name(call.args[1])
        path_map: dict[str, str] = {}
        if len(call.args) > 2 and isinstance(call.args[2], ast.Dict):
            for key, value in zip(call.args[2].keys, call.args[2].values, strict=False):
                literal_key = self._literal_string(key)
                endpoint = self._edge_endpoint(value)
                if literal_key is not None and endpoint is not None:
                    path_map[literal_key] = endpoint
        return {
            "source": source,
            "router": router_name,
            "path_map": path_map,
        }

    def _extract_call(self, stmt: ast.stmt) -> ast.Call | None:
        if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Call):
            return stmt.value
        return None

    def _is_state_graph_ctor(self, node: ast.AST) -> bool:
        if not isinstance(node, ast.Call):
            return False
        func = node.func
        return isinstance(func, ast.Name) and self.import_aliases.get(func.id, func.id) == "StateGraph"

    def _extract_state_schema(self, node: ast.Call) -> str | None:
        if not node.args:
            return None
        arg = node.args[0]
        if isinstance(arg, ast.Name):
            return arg.id
        return ast.get_source_segment(self.source, arg)

    def _is_graph_method_call(self, call: ast.Call, graph_var: str) -> bool:
        func = call.func
        return (
            isinstance(func, ast.Attribute)
            and isinstance(func.value, ast.Name)
            and func.value.id == graph_var
        )

    def _is_service_method_call(self, call: ast.Call, method_name: str) -> bool:
        func = call.func
        return (
            isinstance(func, ast.Attribute)
            and func.attr == method_name
            and isinstance(func.value, ast.Call)
            and isinstance(func.value.func, ast.Name)
            and func.value.func.id == "get_service"
        )

    def _callable_name(self, node: ast.AST) -> str | None:
        if isinstance(node, ast.Name):
            return node.id
        if isinstance(node, ast.Attribute):
            return node.attr
        return ast.get_source_segment(self.source, node)

    def _edge_endpoint(self, node: ast.AST) -> str | None:
        if isinstance(node, ast.Name):
            alias = self.import_aliases.get(node.id, node.id)
            if alias == "START":
                return "__start__"
            if alias == "END":
                return "__end__"
            return node.id
        return self._literal_string(node)

    def _literal_string(self, node: ast.AST | None) -> str | None:
        if node is None:
            return None
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            return node.value
        return None
