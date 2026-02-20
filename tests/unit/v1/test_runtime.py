import pytest

from runtimes.v1.executors.bash_executor import BashExecutor
from runtimes.v1.runtime import WorkflowRuntime


@pytest.mark.asyncio
async def test_runtime_simple_bash():
    trajectory = {
        "version": "1.0",
        "steps": [
            {
                "id": "run_echo",
                "type": "action",
                "action": "bash://run",
                "args": {
                    "command": "echo 'hello runtime'"
                }
            },
            {
                "id": "run_echo_2",
                "type": "action",
                "action": "bash://run",
                "args": {
                    # Reference the stdout from previous step (strip trailing newline if needed, but echo will just print it)
                    "command": "echo 'Previous step output: ${run_echo.output.stdout}'"
                }
            }
        ]
    }
    
    executors = {"bash": BashExecutor()}
    runtime = WorkflowRuntime(executors, trajectory, inputs={})
    
    outputs = await runtime.run()
    assert "hello runtime" in outputs["run_echo"]["stdout"]
    assert "Previous step output: hello runtime" in outputs["run_echo_2"]["stdout"]

@pytest.mark.asyncio
async def test_runtime_variables():
    trajectory = {
        "version": "1.0",
        "variables": [
            {"name": "greeting", "type": "string", "value": "hello"}
        ],
        "steps": [
            {
                "type": "set",
                "variables": {
                    "target": "${inputs.target}"
                }
            },
            {
                "id": "run_echo",
                "type": "action",
                "action": "bash://run",
                "args": {
                    "command": "echo '${variables.greeting} ${variables.target}'"
                }
            }
        ]
    }
    
    executors = {"bash": BashExecutor()}
    runtime = WorkflowRuntime(executors, trajectory, inputs={"target": "world"})
    
    outputs = await runtime.run()
    assert "hello world" in outputs["run_echo"]["stdout"]

@pytest.mark.asyncio
async def test_runtime_if_condition():
    trajectory = {
        "version": "1.0",
        "steps": [
            {
                "type": "if",
                "condition": "${inputs.should_run}",
                "then": [
                    {
                        "id": "run_echo",
                        "type": "action",
                        "action": "bash://run",
                        "args": {"command": "echo 'did run'"}
                    }
                ],
                "else": [
                     {
                        "id": "run_echo",
                        "type": "action",
                        "action": "bash://run",
                        "args": {"command": "echo 'did not run'"}
                    }
                ]
            }
        ]
    }
    
    executors = {"bash": BashExecutor()}
    
    # Test Truthy
    runtime_true = WorkflowRuntime(executors, trajectory, {"should_run": "True"})
    out_true = await runtime_true.run()
    assert "did run" in out_true["run_echo"]["stdout"]
    
    # Test Falsy
    runtime_false = WorkflowRuntime(executors, trajectory, {"should_run": "False"})
    out_false = await runtime_false.run()
    assert "did not run" in out_false["run_echo"]["stdout"]
