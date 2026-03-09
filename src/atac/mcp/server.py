"""ATaC MCP server exposing graph execution."""

from __future__ import annotations

import importlib
import os
import shutil
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import yaml
from mcp.server.fastmcp import FastMCP

from atac.bootstrap import load_service_from_bootstrap
from atac.service import AtacService


class AtacMCPTools:
    """Structured ATaC graph operations exposed through MCP."""

    def __init__(self, service: AtacService, atac_dir: str | os.PathLike[str]) -> None:
        self.service = service
        self.atac_dir = Path(atac_dir).expanduser().resolve()
        self.atac_dir.mkdir(parents=True, exist_ok=True)
        if str(self.atac_dir) not in sys.path:
            sys.path.insert(0, str(self.atac_dir))

    async def run_graph(
        self,
        graph_spec: str,
        state: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        resolved_graph_spec = self._resolve_graph_spec(graph_spec)
        raw = await self.service.arun_graph(resolved_graph_spec, state or {})
        return {
            "ok": True,
            "graph": graph_spec,
            "result": raw,
        }

    def save_graph(
        self,
        name: str,
        graph_code: str,
        description: str,
        inputs: list[dict[str, Any]],
        outputs: list[dict[str, Any]],
        example_state: dict[str, Any],
    ) -> dict[str, Any]:
        graph_name = _validate_graph_name(name)
        description_payload = {
            "name": graph_name,
            "description": description,
            "graph_spec": f"{graph_name}.graph:build_graph",
            "inputs": inputs,
            "outputs": outputs,
            "example_state": example_state,
        }
        graph_dir = self.atac_dir / graph_name

        temp_root = Path(tempfile.mkdtemp(prefix=f"{graph_name}-", dir=self.atac_dir))
        temp_graph_dir = temp_root / graph_name
        try:
            temp_graph_dir.mkdir(parents=True, exist_ok=True)
            self._write_graph_files(
                temp_graph_dir,
                graph_code=graph_code,
                description_payload=description_payload,
            )
            self._validate_graph_package(graph_name, temp_root)

            if graph_dir.exists():
                shutil.rmtree(graph_dir)
            shutil.move(str(temp_graph_dir), str(graph_dir))
        finally:
            if temp_root.exists():
                shutil.rmtree(temp_root)
            self._clear_graph_modules(graph_name)
            importlib.invalidate_caches()

        return {
            "ok": True,
            "name": graph_name,
            "directory": str(graph_dir),
            "graph_spec": f"{graph_name}.graph:build_graph",
        }

    def get_graph(self, name: str, include_code: bool = False) -> dict[str, Any]:
        graph_name = _validate_graph_name(name)
        graph_dir = self.atac_dir / graph_name
        description_path = graph_dir / "description.yaml"
        graph_path = graph_dir / "graph.py"
        if not description_path.exists():
            raise FileNotFoundError(f"Graph '{graph_name}' does not have a description.yaml")
        if not graph_path.exists():
            raise FileNotFoundError(f"Graph '{graph_name}' does not have a graph.py")

        raw = yaml.safe_load(description_path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise ValueError(f"Graph description '{description_path}' must contain a YAML object")

        result = {
            "ok": True,
            "name": graph_name,
            "directory": str(graph_dir),
            "description": dict(raw),
        }
        if include_code:
            result["graph_code"] = graph_path.read_text(encoding="utf-8")
        return result

    def list_graph(self) -> list[dict[str, Any]]:
        graphs: list[dict[str, Any]] = []
        for graph_dir in sorted(path for path in self.atac_dir.iterdir() if path.is_dir()):
            description_path = graph_dir / "description.yaml"
            if not description_path.exists():
                continue

            raw = yaml.safe_load(description_path.read_text(encoding="utf-8"))
            if not isinstance(raw, dict):
                raise ValueError(
                    f"Graph description '{description_path}' must contain a YAML object"
                )

            entry = dict(raw)
            entry.setdefault("name", graph_dir.name)
            entry.setdefault("graph_spec", f"{graph_dir.name}.graph:build_graph")
            entry["directory"] = str(graph_dir)
            graphs.append(entry)
        return graphs

    def _resolve_graph_spec(self, graph_spec: str) -> str:
        if ":" in graph_spec:
            return graph_spec
        graph_name = _validate_graph_name(graph_spec)
        return f"{graph_name}.graph:build_graph"

    def _validate_graph_package(self, graph_name: str, package_root: Path) -> None:
        graph_spec = f"{graph_name}.graph:build_graph"
        with _prepend_sys_path(package_root):
            importlib.invalidate_caches()
            self._clear_graph_modules(graph_name)
            self.service.load_graph(graph_spec)

    def _write_graph_files(
        self,
        graph_dir: Path,
        *,
        graph_code: str,
        description_payload: dict[str, Any],
    ) -> None:
        (graph_dir / "__init__.py").write_text("", encoding="utf-8")
        (graph_dir / "graph.py").write_text(graph_code, encoding="utf-8")
        (graph_dir / "description.yaml").write_text(
            yaml.safe_dump(description_payload, allow_unicode=True, sort_keys=False),
            encoding="utf-8",
        )

    def _clear_graph_modules(self, graph_name: str) -> None:
        for module_name in list(sys.modules):
            if module_name == graph_name or module_name.startswith(f"{graph_name}."):
                sys.modules.pop(module_name, None)


def create_mcp_server(
    service: AtacService,
    *,
    atac_dir: str | os.PathLike[str],
    server_name: str = "ATaC",
) -> FastMCP:
    """Create a FastMCP server bound to an ATaC service."""
    mcp = FastMCP(server_name)
    tools = AtacMCPTools(service, atac_dir)

    @mcp.tool()
    async def run_graph(
        graph_spec: str,
        state: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Run a compiled LangGraph-style app loaded from <module:function>."""
        return await tools.run_graph(graph_spec=graph_spec, state=state)

    @mcp.tool()
    def save_graph(
        name: str,
        graph_code: str,
        description: str,
        inputs: list[dict[str, Any]],
        outputs: list[dict[str, Any]],
        example_state: dict[str, Any],
    ) -> dict[str, Any]:
        """Save graph code and description metadata into the configured ATAC_DIR."""
        return tools.save_graph(
            name=name,
            graph_code=graph_code,
            description=description,
            inputs=inputs,
            outputs=outputs,
            example_state=example_state,
        )

    @mcp.tool()
    def list_graph() -> list[dict[str, Any]]:
        """List all saved graph descriptions under the configured ATAC_DIR."""
        return tools.list_graph()

    @mcp.tool()
    def get_graph(name: str, include_code: bool = False) -> dict[str, Any]:
        """Return saved graph metadata and optionally include graph source code."""
        return tools.get_graph(name, include_code=include_code)

    return mcp


def load_mcp_service_from_env() -> AtacService:
    """Load an ATaC service for MCP use from environment variables."""
    bootstrap = os.environ.get("ATAC_BOOTSTRAP")
    if bootstrap:
        return load_service_from_bootstrap(bootstrap)

    return AtacService()


def load_mcp_atac_dir_from_env() -> Path:
    """Load the graph storage directory for MCP use from environment variables."""

    atac_dir = os.environ.get("ATAC_DIR")
    if atac_dir:
        return Path(atac_dir).expanduser().resolve()
    raise RuntimeError("ATAC_DIR is required for mcp")


def main() -> None:
    """Start the ATaC MCP server over stdio."""
    service = load_mcp_service_from_env()
    atac_dir = load_mcp_atac_dir_from_env()
    create_mcp_server(service, atac_dir=atac_dir).run()


def _validate_graph_name(name: str) -> str:
    normalized = name.strip()
    if not normalized:
        raise ValueError("Graph name cannot be empty")
    if not normalized.replace("_", "").isalnum() or normalized[0].isdigit():
        raise ValueError(
            "Graph name must be a valid module-like identifier using letters, digits, or underscores"
        )
    return normalized


@contextmanager
def _prepend_sys_path(path: Path):
    sys.path.insert(0, str(path))
    try:
        yield
    finally:
        try:
            sys.path.remove(str(path))
        except ValueError:
            pass


if __name__ == "__main__":
    main()
