import pytest

from runtimes.v1.executors.bash_executor import BashExecutor
from runtimes.v1.runtime import WorkflowRuntime
from runtimes.v1.validator import AtacValidator


@pytest.mark.asyncio
async def test_full_atac_pipeline():
    """
    Simulates the end-to-end process:
    1. Define DSL logic
    2. Validate against JSON schema
    3. Execute logic with state and variables passing and bash executor
    """
    
    # 1. Define a complex trajectory using the ATaC DSL
    trajectory = {
        "version": "1.0",
        "inputs": [
            {"name": "test_word", "type": "string"},
            {"name": "loop_flag", "type": "boolean"}
        ],
        "variables": [
            {
                "name": "internal_count",
                "type": "integer",
                "value": 0
            }
        ],
        "steps": [
            {
                "id": "write_temp",
                "type": "action",
                "action": "bash://run",
                "args": {
                    "command": "echo '${inputs.test_word}' > temp_test.txt"
                }
            },
            {
                "id": "read_temp",
                "type": "action",
                "action": "bash://run",
                "args": {
                    "command": "cat temp_test.txt"
                }
            },
            {
                "type": "if",
                "condition": "${inputs.loop_flag}",
                "then": [
                    {
                        "type": "set",
                        "variables": {
                            "internal_count": 1
                        }
                    },
                    {
                        "type": "for",
                        "in": '["apple", "banana"]',
                        "item": "fruit",
                        "steps": [
                            {
                                "id": "echo_fruit",
                                "type": "action",
                                "action": "bash://run",
                                "args": {
                                    "command": "echo 'Eating ${fruit}'"
                                }
                            }
                        ]
                    }
                ],
                "else": [
                     {
                        "type": "action",
                        "action": "bash://run",
                        "args": {
                            "command": "echo 'Skipped loop'"
                        }
                     }
                ]
            },
            {
                "id": "cleanup",
                "type": "action",
                "action": "bash://run",
                "args": {
                    "command": "rm temp_test.txt"
                }
            }
        ]
    }
    
    # 2. Validation
    validator = AtacValidator()
    # This should pass without raising ValidationError
    validator.validate(trajectory)
    
    # 3. Execution (with loop_flag = True)
    inputs_true = {"test_word": "hello_atac_integration", "loop_flag": "True"}
    executors = {"bash": BashExecutor()}
    
    runtime_true = WorkflowRuntime(executors, trajectory, inputs_true)
    outputs_true = await runtime_true.run()
    
    # Assertions for True case
    assert outputs_true["read_temp"]["returncode"] == 0
    assert "hello_atac_integration" in outputs_true["read_temp"]["stdout"]
    assert runtime_true.context.variables["internal_count"] == 1
    # 'echo_fruit' output will only hold the LAST iteration result
    assert "Eating banana" in outputs_true["echo_fruit"]["stdout"]
    
    # 4. Execution (with loop_flag = False)
    inputs_false = {"test_word": "skip_test", "loop_flag": "False"}
    runtime_false = WorkflowRuntime(executors, trajectory, inputs_false)
    outputs_false = await runtime_false.run()
    
    # Assertions for False case
    assert outputs_false["read_temp"]["returncode"] == 0
    assert "skip_test" in outputs_false["read_temp"]["stdout"]
    assert runtime_false.context.variables["internal_count"] == 0 # Default from trajectory
    assert "echo_fruit" not in outputs_false # Never executed
