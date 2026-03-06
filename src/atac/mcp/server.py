"""ATaC MCP server exposing graph execution."""

from __future__ import annotations

import os
from typing import Any

from mcp.server.fastmcp import FastMCP

from atac.bootstrap import load_service_from_bootstrap
from atac.service import AtacService


class AtacMCPTools:
    """Structured ATaC graph operations exposed through MCP."""

    def __init__(self, service: AtacService) -> None:
        self.service = service

    def run_graph(
        self,
        graph_spec: str,
        state: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        raw = self.service.run_graph(graph_spec, state or {})
        return {
            "ok": True,
            "graph": graph_spec,
            "result": raw,
        }


def create_mcp_server(
    service: AtacService,
    *,
    server_name: str = "ATaC",
) -> FastMCP:
    """Create a FastMCP server bound to an ATaC service."""
    mcp = FastMCP(server_name)
    tools = AtacMCPTools(service)

    @mcp.tool()
    def run_graph(
        graph_spec: str,
        state: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Run a compiled LangGraph-style app loaded from <module:function>."""
        return tools.run_graph(graph_spec=graph_spec, state=state)

    return mcp


def load_mcp_service_from_env() -> AtacService:
    """Load an ATaC service for MCP use from environment variables."""
    bootstrap = os.environ.get("ATAC_BOOTSTRAP")
    if bootstrap:
        return load_service_from_bootstrap(bootstrap)

    return AtacService()


def main() -> None:
    """Start the ATaC MCP server over stdio."""
    service = load_mcp_service_from_env()
    create_mcp_server(service).run()


if __name__ == "__main__":
    main()
