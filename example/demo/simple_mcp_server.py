"""Simple MCP server for the step-by-step ATaC example."""

from __future__ import annotations

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("ATaC Demo MCP")


@mcp.tool()
def echo(text: str) -> str:
    """Echo input text from MCP."""
    return f"mcp:{text}"


if __name__ == "__main__":
    mcp.run()
