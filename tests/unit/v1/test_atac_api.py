import pytest

from atac.core.atac_api import ATaC


def test_workflow_export_json():
    wf = ATaC(name="Test WF", description="A demo")
    wf.add_input("greet_target", "string", "world")
    wf.add_variable("attempts", "integer", 0)
    wf.add_action_step(
        "echo_step", "bash://run", args={"command": "echo hello ${inputs.greet_target}"}
    )

    trajectory = wf.export()
    assert trajectory["version"] == "1.0"
    assert trajectory["meta"]["name"] == "Test WF"
    assert len(trajectory["inputs"]) == 1
    assert trajectory["inputs"][0]["name"] == "greet_target"
    assert len(trajectory["steps"]) == 1
    assert trajectory["steps"][0]["id"] == "echo_step"


@pytest.mark.asyncio
async def test_workflow_execute():
    wf = ATaC()
    wf.add_input("word", "string")
    wf.add_action_step(
        "run_echo", "bash://run", args={"command": "echo '${inputs.word}'"}
    )

    wf.validate()  # ensure it's valid
    outputs = await ATaC.execute(wf.export(), {"word": "magic_sdk_word"})

    assert "magic_sdk_word" in outputs["run_echo"]["stdout"]


def test_workflow_unsupported_version():
    with pytest.raises(ValueError, match="Unsupported schema version: 2.0"):
        ATaC(version="2.0")


def test_workflow_remove_step():
    wf = ATaC()
    wf.add_action_step("step1", "bash://run")
    wf.add_action_step("step2", "bash://run")
    wf.add_if_step("condition")

    # Nested step under if
    wf.add_action_step("nested1", "bash://run", at_path="2.then")
    wf.add_action_step("nested2", "bash://run", at_path="2.then")

    assert len(wf.steps) == 3
    assert len(wf.steps[2].then) == 2

    # Remove nested step
    wf.remove_step("2.then.0")
    assert len(wf.steps[2].then) == 1
    assert wf.steps[2].then[0].id == "nested2"

    # Remove root step
    wf.remove_step("1")
    assert len(wf.steps) == 2
    assert wf.steps[1].type == "if"  # Originally step[2]

    # Remove with invalid path
    with pytest.raises(ValueError):
        wf.remove_step("2")  # Out of bounds now
    with pytest.raises(ValueError):
        wf.remove_step("1.then.5")
    with pytest.raises(ValueError):
        wf.remove_step("")
