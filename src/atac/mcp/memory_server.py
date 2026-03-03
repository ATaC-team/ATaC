"""
ATaC Memory MCP Server — exposes memory CRUD operations as MCP tools.

Start with: atac memory-mcp  (stdio transport)
"""

import json

from mcp.server.fastmcp import FastMCP

from atac.core.atac_memory import ATaCMemory

mcp = FastMCP("ATaC Memory")


@mcp.tool()
def memory_save(data: dict) -> str:
    """
    Validate and save a memory bundle to .atac/.memory/<name>/index.html.

    Args:
        data: Memory object with required fields: name, description, steps.
              Optional fields: tags.
    """
    try:
        path = ATaCMemory.save(data)
        return f"Saved memory '{data.get('name')}' at {path / ATaCMemory.ENTRY_FILE}"
    except Exception as e:
        return f"Error saving memory: {e}"


@mcp.tool()
def memory_list() -> str:
    """
    List all memory bundles in .atac/.memory/.

    Returns:
        JSON array of summary objects: [{name, description, tags}, ...]
    """
    records = ATaCMemory.list_all()
    return json.dumps(records, ensure_ascii=False, indent=2)


@mcp.tool()
def memory_read(name: str) -> str:
    """
    Read the structured content of a memory bundle by name.

    Args:
        name: The slug name of the memory (e.g. 'query_holiday_station_traffic').

    Returns:
        JSON representation of the memory record.
    """
    try:
        data = ATaCMemory.load(name)
        return json.dumps(data, ensure_ascii=False, indent=2)
    except FileNotFoundError as e:
        return f"Error: {e}"


@mcp.tool()
def memory_search(query: str) -> str:
    """
    Search memory records by keyword across name, description, and tags.

    Args:
        query: Case-insensitive search string.

    Returns:
        JSON array of matching memory summaries.
    """
    results = ATaCMemory.search(query)
    return json.dumps(results, ensure_ascii=False, indent=2)


@mcp.tool()
def memory_delete(name: str) -> str:
    """
    Delete a memory bundle by name.

    Args:
        name: The slug name of the memory to delete.
    """
    try:
        ATaCMemory.delete(name)
        return f"Deleted memory '{name}'"
    except FileNotFoundError as e:
        return f"Error: {e}"


if __name__ == "__main__":
    mcp.run()
