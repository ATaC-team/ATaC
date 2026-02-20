import json
from typing import Any

from runtimes.v1.executors.base import ActionExecutor
from runtimes.v1.executors.bash_executor import BashExecutor
from runtimes.v1.executors.mcp_executor import McpExecutor
from runtimes.v1.models import (
    ActionStep,
    DataType,
    InputDef,
    Step,
    VariableDef,
)
from runtimes.v1.runtime import WorkflowRuntime
from runtimes.v1.validator import AtacValidator


class Workflow:
    """Programmatic SDK for building and executing ATaC Trajectories."""
    
    def __init__(self, version: str = "1.0", name: str = "", description: str = ""):
        self.version = version
        self.meta = {"name": name, "description": description}
        self.inputs: list[InputDef] = []
        self.variables: list[VariableDef] = []
        self.steps: list[Step] = []
        
        # Currently only v1 is supported natively here. 
        if self.version != "1.0":
            raise ValueError(f"Unsupported schema version: {self.version}")
            
        # Initialize default validator and executors
        self.validator = AtacValidator()
        self.executors: dict[str, ActionExecutor] = {
            "bash": BashExecutor(),
            "mcp": McpExecutor(servers_config={})
        }

    def register_executor(self, scheme: str, executor: ActionExecutor):
        """Register or override an executor for a specific scheme."""
        self.executors[scheme] = executor
        return self

    def add_input(self, name: str, input_type: DataType = "string", default_value: Any = None):
        """Define an input parameter."""
        in_def = InputDef(name=name, type=input_type, default=default_value)
        self.inputs.append(in_def)
        return self

    def add_variable(self, name: str, var_type: DataType = "string", initial_value: Any = None):
        """Define an intermediate state variable."""
        var_def = VariableDef(name=name, type=var_type, value=initial_value)
        self.variables.append(var_def)
        return self

    def add_step(self, step: Step):
        """Append a step to the workflow."""
        self.steps.append(step)
        return self

    def add_action_step(self, action_id: str, action: str, args: dict[str, Any] | None = None, **kwargs):
        """Helper to append a simple action step."""
        # Convert kwargs like 'if_condition' back to 'if' before creating model or just pass via model args
        # Pydantic alias 'if' for 'if_condition' allows us to just pass kwargs if mapped right.
        # But explicitly map common ones.
        if_cond = kwargs.pop("if", None) or kwargs.pop("if_condition", None)
        
        step = ActionStep(
            id=action_id,
            action=action,
            args=args,
            if_condition=if_cond,
            **kwargs
        )
        self.add_step(step)
        return self

    def export(self) -> dict[str, Any]:
        """Export the workflow definition as a dictionary."""
        trajectory: dict[str, Any] = {
            "version": self.version,
            "meta": self.meta,
            "inputs": [i.model_dump(exclude_none=True) for i in self.inputs],
            "variables": [v.model_dump(exclude_none=True) for v in self.variables],
            # Use by_alias=True so 'if_condition' exports as 'if', 'else_' exports as 'else'
            "steps": [s.model_dump(exclude_none=True, by_alias=True) for s in self.steps]
        }
        
        # Remove empty sections to keep the output clean
        if not trajectory["meta"].get("name") and not trajectory["meta"].get("description"):
            del trajectory["meta"]
        if not trajectory["inputs"]:
            del trajectory["inputs"]
        if not trajectory["variables"]:
            del trajectory["variables"]
            
        return trajectory
        
    def export_json(self, indent: int = 4) -> str:
        """Export the workflow definition as a JSON string."""
        return json.dumps(self.export(), indent=indent)

    def validate(self):
        """Validate the current workflow definition against the DSL schema."""
        trajectory = self.export()
        self.validator.validate(trajectory)
        return True

    async def execute(self, inputs: dict[str, Any] | None = None) -> dict[str, Any]:
        """Validate and execute the workflow with the provided inputs."""
        inputs = inputs or {}
        trajectory = self.export()
        
        # Validate first
        self.validator.validate(trajectory)
        
        # Execute using corresponding runtime
        runtime = WorkflowRuntime(self.executors, trajectory, inputs)
        outputs = await runtime.run()
        return outputs
