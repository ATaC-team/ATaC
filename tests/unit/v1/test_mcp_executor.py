from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from mcp import StdioServerParameters

from atac.runtimes.v1.executors.mcp_executor import McpExecutor
from atac.runtimes.v1.parser import ParsedAction


@pytest.fixture
def mock_mcp_config():
    return {
        "test_server": StdioServerParameters(command="echo", args=[])
    }

@pytest.mark.asyncio
async def test_mcp_executor_wrong_scheme(mock_mcp_config):
    executor = McpExecutor(mock_mcp_config)
    action = ParsedAction(scheme="bash", server_or_cmd="run", method="", query_params={})
    with pytest.raises(ValueError, match="cannot handle scheme: bash"):
        await executor.execute(action, {})

@pytest.mark.asyncio
async def test_mcp_executor_unknown_server(mock_mcp_config):
    executor = McpExecutor(mock_mcp_config)
    action = ParsedAction(scheme="mcp", server_or_cmd="unknown_server", method="tool", query_params={})
    with pytest.raises(ValueError, match="Unknown MCP server: unknown_server"):
        await executor.execute(action, {})

@pytest.mark.asyncio
@patch('atac.runtimes.v1.executors.mcp_executor.stdio_client')
@patch('atac.runtimes.v1.executors.mcp_executor.ClientSession')
async def test_mcp_executor_success(mock_Session, mock_stdio_client, mock_mcp_config):
    # Setup Context Managers Mocks
    mock_stdio_cm = AsyncMock()
    mock_stdio_cm.__aenter__.return_value = (AsyncMock(), AsyncMock())
    mock_stdio_client.return_value = mock_stdio_cm
    
    # Mock Session
    mock_session_instance = AsyncMock()
    
    # Mock tool list response
    mock_tool = MagicMock()
    mock_tool.name = "test_tool"
    mock_tools_response = MagicMock()
    mock_tools_response.tools = [mock_tool]
    mock_session_instance.list_tools.return_value = mock_tools_response
    
    # Mock call tool response
    mock_result_item = MagicMock()
    mock_result_item.type = "text"
    mock_result_item.text = "Hello Context"
    mock_call_result = MagicMock()
    mock_call_result.content = [mock_result_item]
    mock_call_result.isError = False
    mock_session_instance.call_tool.return_value = mock_call_result
    
    mock_session_cm = AsyncMock()
    mock_session_cm.__aenter__.return_value = mock_session_instance
    mock_Session.return_value = mock_session_cm

    executor = McpExecutor(mock_mcp_config)
    action = ParsedAction(scheme="mcp", server_or_cmd="test_server", method="test_tool", query_params={"arg": "value"})
    
    result = await executor.execute(action, {"arg": "value"})
    
    assert not result["isError"]
    assert result["content"][0]["text"] == "Hello Context"
    
    # Verify initialize called
    mock_session_instance.initialize.assert_called_once()
    mock_session_instance.call_tool.assert_called_once_with("test_tool", arguments={"arg": "value"})
