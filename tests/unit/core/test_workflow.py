import pytest

from src.core.workflow import Workflow


def test_workflow_export_json():
    wf = Workflow(name="Test WF", description="A demo")
    wf.add_input("greet_target", "string", "world")
    wf.add_variable("attempts", "integer", 0)
    wf.add_action_step("echo_step", "bash://run", args={"command": "echo hello ${inputs.greet_target}"})
    
    trajectory = wf.export()
    assert trajectory["version"] == "1.0"
    assert trajectory["meta"]["name"] == "Test WF"
    assert len(trajectory["inputs"]) == 1
    assert trajectory["inputs"][0]["name"] == "greet_target"
    assert len(trajectory["steps"]) == 1
    assert trajectory["steps"][0]["id"] == "echo_step"

@pytest.mark.asyncio
async def test_workflow_execute():
    wf = Workflow()
    wf.add_input("word", "string")
    wf.add_action_step(
        "run_echo", 
        "bash://run", 
        args={"command": "echo '${inputs.word}'"}
    )
    
    wf.validate() # ensure it's valid
    outputs = await wf.execute({"word": "magic_sdk_word"})
    
    assert "magic_sdk_word" in outputs["run_echo"]["stdout"]

def test_workflow_unsupported_version():
    with pytest.raises(ValueError, match="Unsupported schema version: 2.0"):
        Workflow(version="2.0")
