import pytest

from atac.runtimes.v1.executors import BashExecutor
from atac.runtimes.v1.parser import ParsedAction


@pytest.mark.asyncio
async def test_bash_executor_success():
    executor = BashExecutor()
    action = ParsedAction(scheme="bash", server_or_cmd="run", method="", query_params={})
    args = {"command": "echo 'hello world'"}
    
    result = await executor.execute(action, args)
    
    assert result["returncode"] == 0
    assert "hello world" in result["stdout"]

@pytest.mark.asyncio
async def test_bash_executor_failure():
    executor = BashExecutor()
    action = ParsedAction(scheme="bash", server_or_cmd="run", method="", query_params={})
    args = {"command": "invalid_command_that_does_not_exist"}
    
    with pytest.raises(RuntimeError, match="Bash command failed"):
        await executor.execute(action, args)

@pytest.mark.asyncio
async def test_bash_executor_wrong_scheme():
    executor = BashExecutor()
    action = ParsedAction(scheme="mcp", server_or_cmd="google", method="search", query_params={})
    args = {"command": "ls"}
    
    with pytest.raises(ValueError, match="cannot handle scheme: mcp"):
        await executor.execute(action, args)
