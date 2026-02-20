import json
from typing import Any

from atac.runtimes.v1.executors.base import ActionExecutor
from atac.runtimes.v1.executors.bash_executor import BashExecutor
from atac.runtimes.v1.executors.kimi_executor import KimiExecutor
from atac.runtimes.v1.executors.mcp_executor import McpExecutor
from atac.runtimes.v1.models import (
    ActionStep,
    DataType,
    ForStep,
    IfStep,
    InputDef,
    SetStep,
    Step,
    Trajectory,
    VariableDef,
)
from atac.runtimes.v1.runtime import WorkflowRuntime
from atac.runtimes.v1.validator import AtacValidator


class ATaC:
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
            
        # Initialize default validator
        self.validator = AtacValidator()

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ATaC":
        """Load an ATaC builder from an existing trajectory dictionary."""
        traj = Trajectory.model_validate(data)
        obj = cls(
            version=traj.version,
            name=traj.meta.name if traj.meta else "",
            description=traj.meta.description if traj.meta else ""
        )
        obj.inputs = traj.inputs
        obj.variables = traj.variables
        obj.steps = traj.steps
        return obj

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

    def _resolve_steps_list(self, at_path: str | None) -> list[Step]:
        """
        Resolve a dot-separated path to a nested steps list.
        
        Path format examples using indices from 'atac show':
            None       -> root steps
            "0"        -> first step's body (if it's a loop)
            "0.2.then" -> then branch of step index 2 inside step 0
        """
        if not at_path:
            return self.steps
        
        current_list = self.steps
        parts = at_path.split(".")
        i = 0
        while i < len(parts):
            idx = int(parts[i])
            if idx >= len(current_list):
                raise ValueError(f"Index {idx} out of range")
            target = current_list[idx]
            i += 1
            
            if i >= len(parts):
                # We have reached the final step in the path. Return its body.
                if isinstance(target, ForStep):
                    return target.steps
                raise ValueError(f"Step at index {idx} does not have a single body. Use .then or .else for if-steps.")

            # Look ahead for branch names (then/else)
            sub_part = parts[i]
            if sub_part == "then":
                if not isinstance(target, IfStep):
                    raise ValueError(f"'.then' only valid on an if-step")
                current_list = target.then
                i += 1
            elif sub_part == "else":
                if not isinstance(target, IfStep):
                    raise ValueError(f"'.else' only valid on an if-step")
                if target.else_ is None:
                    target.else_ = []
                current_list = target.else_
                i += 1
            elif isinstance(target, ForStep):
                # Auto-navigate to for-loop body
                current_list = target.steps
            else:
                raise ValueError(f"Nesting at '{sub_part}' not supported for step at index {idx}")
                
        return current_list

    def add_step(self, step: Step, at_path: str | None = None):
        """Append a step to the workflow at the given path."""
        target = self._resolve_steps_list(at_path)
        target.append(step)
        return self

    def add_action_step(self, action_id: str, action: str, args: dict[str, Any] | None = None, 
                        at_path: str | None = None, **kwargs):
        """Append an action step."""
        if_cond = kwargs.pop("if", None) or kwargs.pop("if_condition", None)
        step = ActionStep(id=action_id, action=action, args=args, if_condition=if_cond, **kwargs)
        return self.add_step(step, at_path)
    
    def add_set_step(self, variables: dict[str, Any], at_path: str | None = None):
        """Append a set step."""
        step = SetStep(variables=variables)
        return self.add_step(step, at_path)
    
    def add_for_step(self, in_expr: str, item: str, at_path: str | None = None):
        """Append a for-loop step (with empty body)."""
        step = ForStep(in_=in_expr, item=item, steps=[])
        return self.add_step(step, at_path)
    
    def add_if_step(self, condition: str, at_path: str | None = None):
        """Append an if step (with empty then/else branches)."""
        step = IfStep(condition=condition, then=[], else_=[])
        return self.add_step(step, at_path)

    def export(self) -> dict[str, Any]:
        """Export the workflow definition as a dictionary."""
        trajectory: dict[str, Any] = {
            "version": self.version,
            "meta": self.meta,
            "inputs": [i.model_dump(exclude_none=True) for i in self.inputs],
            "variables": [v.model_dump(exclude_none=True) for v in self.variables],
            "steps": [s.model_dump(exclude_none=True, by_alias=True) for s in self.steps]
        }
        
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
        """Validate the current built definition against the DSL schema."""
        trajectory = self.export()
        self.validator.validate(trajectory)
        return True

    @staticmethod
    async def execute(
        trajectory: dict[str, Any] | Trajectory, 
        inputs: dict[str, Any] | None = None,
        executors: dict[str, ActionExecutor] | None = None,
        mcp_config_paths: list[str] | None = None,
        kimi_path: str | None = None
    ) -> dict[str, Any]:
        """
        Statically execute an ATaC trajectory.
        
        MCP servers are resolved in order of priority:
          1. Explicit `executors` dict (highest priority)
          2. Config files from `mcp_config_paths` + env ATAC_MCP_SERVER_CONFIGS
          3. Empty MCP config (bash-only fallback)
        
        Args:
            trajectory: DSL trajectory dict or Trajectory model.
            inputs: Runtime input values.
            executors: Pre-built executors (takes priority over config).
            mcp_config_paths: Extra MCP config file paths, merged with env.
        """
        inputs = inputs or {}
        
        if isinstance(trajectory, dict):
            AtacValidator().validate(trajectory)
        
        if executors:
            execs = executors
        else:
            from atac.core.config import load_mcp_servers
            mcp_servers = load_mcp_servers(extra_paths=mcp_config_paths)
            execs = {
                "bash": BashExecutor(),
                "mcp": McpExecutor(servers_config=mcp_servers),
                "kimi": KimiExecutor(kimi_cli_path=kimi_path)
            }
        
        runtime = WorkflowRuntime(execs, trajectory, inputs)
        return await runtime.run()
