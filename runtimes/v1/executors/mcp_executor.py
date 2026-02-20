import json
from contextlib import AsyncExitStack
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from runtimes.v1.models import ParsedAction


class McpExecutor:
    """Executes mcp:// actions with pooled server sessions."""
    
    def __init__(self, servers_config: dict[str, StdioServerParameters]):
        self.servers_config = servers_config
        self._sessions: dict[str, ClientSession] = {}
        self._exit_stack: AsyncExitStack | None = None

    async def _get_session(self, server_name: str) -> ClientSession:
        """Get or create a persistent session for a server."""
        if server_name in self._sessions:
            return self._sessions[server_name]
        
        if server_name not in self.servers_config:
            raise ValueError(f"Unknown MCP server: {server_name}")
        
        if self._exit_stack is None:
            self._exit_stack = AsyncExitStack()
            await self._exit_stack.__aenter__()
        
        server_params = self.servers_config[server_name]
        read, write = await self._exit_stack.enter_async_context(
            stdio_client(server_params)
        )
        session = await self._exit_stack.enter_async_context(
            ClientSession(read, write)
        )
        await session.initialize()
        
        self._sessions[server_name] = session
        return session

    async def execute(self, action: ParsedAction, args: dict[str, Any]) -> Any:
        """Execute an MCP action using a pooled session."""
        if action.scheme != "mcp":
            raise ValueError(f"McpExecutor cannot handle scheme: {action.scheme}")
            
        server_name = action.server_or_cmd
        tool_name = action.method
        
        session = await self._get_session(server_name)
        
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

    async def close(self):
        """Close all pooled sessions."""
        if self._exit_stack:
            await self._exit_stack.aclose()
            self._exit_stack = None
            self._sessions.clear()
