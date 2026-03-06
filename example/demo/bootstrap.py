"""Step-by-step ATaC bootstrap example."""

from __future__ import annotations

import asyncio
import inspect
import sys
from pathlib import Path

import atac.subprocess as subprocess
from atac import AtacService, set_service
from atac.wrapper.langgraph import MultiServerMCPClient, tool

service = AtacService()
set_service(service)


@tool(name="bash")
def bash_tool(command: str) -> str:
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


client = MultiServerMCPClient(
    {
        "demo_mcp": {
            "transport": "stdio",
            "command": sys.executable,
            "args": [str(Path(__file__).with_name("simple_mcp_server.py"))],
        }
    },
    prefix="mcp",
    auto_register=True,
)


def create_agent(model):
    """Create a LangGraph agent with the registered LangGraph and MCP tools."""
    from langgraph.prebuilt import create_react_agent

    mcp_tools = client.get_tools()
    if inspect.isawaitable(mcp_tools):
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            mcp_tools = asyncio.run(mcp_tools)
        else:
            raise RuntimeError("Await client.get_tools() before creating the agent in async code.")

    return create_react_agent(model, [bash_tool, *list(mcp_tools)])


def get_service() -> AtacService:
    """Return the module-level ATaC service."""
    return service
