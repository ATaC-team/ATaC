import json
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from runtimes.v1.models import ParsedAction


class McpExecutor:
    """Executes mcp:// actions."""
    
    def __init__(self, servers_config: dict[str, StdioServerParameters]):
        """
        Initialize the executor with known servers.
        
        Args:
            servers_config: Mapping from server name (e.g. 'google') 
                            to StdioServerParameters.
        """
        self.servers_config = servers_config

    async def execute(self, action: ParsedAction, args: dict[str, Any]) -> Any:
        """
        Execute an MCP action.
        
        Args:
            action: Should represent an 'mcp://' scheme.
            args: The tool arguments.
            
        Returns:
            The tool call result.
        """
        if action.scheme != "mcp":
            raise ValueError(f"McpExecutor cannot handle scheme: {action.scheme}")
            
        server_name = action.server_or_cmd
        tool_name = action.method
        
        if server_name not in self.servers_config:
            raise ValueError(f"Unknown MCP server: {server_name}")
            
        server_params = self.servers_config[server_name]
        
        # In a real workflow, we might pool these sessions instead of 
        # starting/stopping per action. For simplicity, we start fresh here.
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                # Initialize connection
                await session.initialize()
                
                # Verify tool exists (optional but good for debugging)
                tools_response = await session.list_tools()
                tool_exists = any(t.name == tool_name for t in tools_response.tools)
                if not tool_exists:
                     raise ValueError(f"Tool '{tool_name}' not found on server '{server_name}'.")
                     
                # Call tool
                result = await session.call_tool(tool_name, arguments=args)
                
                # Transform result — auto-parse JSON strings in text fields
                content = []
                for item in result.content:
                    text = getattr(item, 'text', str(item))
                    try:
                        text = json.loads(text)
                    except (json.JSONDecodeError, TypeError):
                        pass
                    content.append({"type": item.type, "text": text})
                
                return {
                    "content": content,
                    "isError": getattr(result, 'isError', False)
                }
