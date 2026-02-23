import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from atac.runtimes.v1.executors.kimi_executor import KimiExecutor
from atac.runtimes.v1.models import ParsedAction


@pytest.fixture
def mock_kimi_cli():
    """Mock the kimi_cli module and its tools."""
    with patch.dict(sys.modules):
        # Create a mock module structure
        kimi_cli = MagicMock()
        sys.modules['kimi_cli'] = kimi_cli
        
        # Mock kaos and related modules
        kaos = MagicMock()
        kaos_path = MagicMock()
        kaos_path_class = MagicMock()
        kaos_path_class.cwd.return_value = "/mock/cwd"
        kaos_path.KaosPath = kaos_path_class
        sys.modules['kaos'] = kaos
        sys.modules['kaos.path'] = kaos_path
        
        # Mock specific tools used by the executor
        fetch_module = MagicMock()
        fetch_class = MagicMock()
        fetch_instance = AsyncMock()
        
        # Mock successful tool result
        mock_result = MagicMock()
        mock_result.is_error = False
        mock_result.output = "Fetched content"
        fetch_instance.return_value = mock_result
        
        # Mock class instantiation
        fetch_class.return_value = fetch_instance
        
        # We need to simulate the signature for inspect
        import inspect
        fetch_class.__signature__ = inspect.Signature([
            inspect.Parameter("config", inspect.Parameter.POSITIONAL_OR_KEYWORD),
            inspect.Parameter("runtime", inspect.Parameter.POSITIONAL_OR_KEYWORD)
        ])
        
        # No params object, so it will fall to the `await tool(**args)` branch
        del fetch_class.params
        del fetch_instance.params
        fetch_module.FetchURL = fetch_class
        sys.modules['kimi_cli.tools.web.fetch'] = fetch_module
        
        # Another tool with params
        grep_module = MagicMock()
        grep_class = MagicMock()
        grep_instance = AsyncMock()
        
        mock_params = MagicMock()
        mock_params_validate = MagicMock()
        mock_params_validate.return_value = {"validated": True}
        grep_instance.params = mock_params
        grep_instance.params.model_validate = mock_params_validate
        
        grep_result = MagicMock()
        grep_result.is_error = False
        grep_result.output = "Grep lines"
        grep_instance.return_value = grep_result
        
        grep_class.return_value = grep_instance
        grep_class.__signature__ = inspect.Signature([])
        
        grep_module.Grep = grep_class
        sys.modules['kimi_cli.tools.file.grep_local'] = grep_module
        
        # Mock error tool
        read_module = MagicMock()
        read_class = MagicMock()
        read_instance = AsyncMock()
        
        error_result = MagicMock()
        error_result.is_error = True
        error_result.message = "File not found"
        del read_class.params
        del read_instance.params
        read_instance.return_value = error_result
        
        read_class.return_value = read_instance
        read_class.__signature__ = inspect.Signature([])
        
        read_module.ReadFile = read_class
        sys.modules['kimi_cli.tools.file.read'] = read_module

        yield {
            "fetch": fetch_class,
            "fetch_instance": fetch_instance,
            "grep": grep_class,
            "grep_instance": grep_instance,
            "read": read_class,
            "read_instance": read_instance,
        }

@pytest.mark.asyncio
async def test_kimi_executor_missing_module():
    """Test behavior when kimi-cli is not installed."""
    # We must patch importlib.import_module and also the simple 'import kimi_cli'
    with patch.dict(sys.modules):
        if 'kimi_cli' in sys.modules:
            del sys.modules['kimi_cli']
            
        executor = KimiExecutor()
        action = ParsedAction(scheme="kimi", server_or_cmd="web", method="fetch", query_params={})
        
        with patch('builtins.__import__', side_effect=ImportError):
            with pytest.raises(ImportError, match="To use the KimiExecutor, please install ATaC"):
                await executor.execute(action, {})


@pytest.mark.asyncio
async def test_kimi_executor_unknown_tool(mock_kimi_cli):
    executor = KimiExecutor()
    action = ParsedAction(scheme="kimi", server_or_cmd="unknown", method="tool", query_params={})
    
    with pytest.raises(ValueError, match="Unknown Kimi tool: unknown/tool"):
        await executor.execute(action, {})


@pytest.mark.asyncio
async def test_kimi_executor_success_without_params(mock_kimi_cli):
    executor = KimiExecutor()
    action = ParsedAction(scheme="kimi", server_or_cmd="web", method="fetch", query_params={})
    args = {"url": "https://example.com"}
    
    result = await executor.execute(action, args)
    
    assert result == "Fetched content"
    
    # Verify the tool was instantiated with config and runtime
    mock_kimi_cli["fetch"].assert_called_once()
    kwargs = mock_kimi_cli["fetch"].call_args.kwargs
    assert "config" in kwargs
    assert "runtime" in kwargs
    
    # Verify tool call args
    mock_kimi_cli["fetch_instance"].assert_called_once_with(**args)


@pytest.mark.asyncio
async def test_kimi_executor_success_with_params(mock_kimi_cli):
    executor = KimiExecutor()
    action = ParsedAction(scheme="kimi", server_or_cmd="file", method="grep", query_params={})
    args = {"pattern": "TODO"}
    
    result = await executor.execute(action, args)
    
    assert result == "Grep lines"
    
    # Verify params were validated
    mock_kimi_cli["grep_instance"].params.model_validate.assert_called_once_with(args)
    
    # Verify tool call with validated params
    mock_kimi_cli["grep_instance"].assert_called_once_with({"validated": True})


@pytest.mark.asyncio
async def test_kimi_executor_tool_error(mock_kimi_cli):
    executor = KimiExecutor()
    action = ParsedAction(scheme="kimi", server_or_cmd="file", method="read", query_params={})
    args = {"path": "/invalid/path"}
    
    with pytest.raises(RuntimeError, match="Kimi tool error: File not found"):
        await executor.execute(action, args)
