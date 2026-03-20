"""Step-by-step ATaC bootstrap example."""

from __future__ import annotations

import asyncio
import inspect
import sys
from pathlib import Path

from langchain_core.tools import tool
from langchain_mcp_adapters.client import MultiServerMCPClient

import atac.subprocess as subprocess
from atac import AtacService

service = AtacService()


@tool
def bash(command: str) -> str:
    """Run a shell command inside the current runtime workdir."""
    completed = subprocess.run(
        command,
        shell=True,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            completed.stderr.strip()
            or f"bash command failed with exit code {completed.returncode}"
        )
    return completed.stdout.rstrip("\n")


service.register_langgraph_tools([bash])


client = MultiServerMCPClient(
    {
        "demo_mcp": {
            "transport": "stdio",
            "command": sys.executable,
            "args": [str(Path(__file__).with_name("simple_mcp_server.py"))],
        }
    }
)


def _resolve_mcp_tools() -> list[object]:
    tools = client.get_tools()
    if inspect.isawaitable(tools):
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            tools = asyncio.run(tools)
        else:
            raise RuntimeError("Await client.get_tools() before importing bootstrap in async code.")
    return list(tools)


MCP_TOOLS = _resolve_mcp_tools()
service.register_langgraph_tools(MCP_TOOLS)


def create_agent(model):
    """Create a LangGraph agent with the registered LangGraph and MCP tools."""
    from langgraph.prebuilt import create_react_agent

    return create_react_agent(model, [bash, *MCP_TOOLS])


def get_service() -> AtacService:
    """Return the module-level ATaC service."""
    return service
