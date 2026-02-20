from typing import Any

from atac.runtimes.v1.context import WorkflowContext
from atac.runtimes.v1.executors.base import ActionExecutor
from atac.runtimes.v1.models import (
    ActionStep,
    ForStep,
    IfStep,
    SetStep,
    Step,
    Trajectory,
)
from atac.runtimes.v1.parser import ActionParser


class WorkflowRuntime:
    """Interprets and executes ATaC format trajectories."""
    
    def __init__(self, 
                 executors: dict[str, ActionExecutor], 
                 trajectory: dict[str, Any] | Trajectory, 
                 inputs: dict[str, Any]):
        """
        Initialize the runtime.
        
        Args:
           executors: A dict mapping scheme (e.g., 'mcp', 'bash') to its executor.
           trajectory: The loaded trajectory JSON data or a Trajectory model.
           inputs: Initial inputs provided by the user.
        """
        self.executors = executors
        if isinstance(trajectory, dict):
            self.trajectory = Trajectory.model_validate(trajectory)
        else:
            self.trajectory = trajectory
        
        # Apply input defaults from trajectory, then overlay user-provided inputs
        merged_inputs: dict[str, Any] = {}
        for inp_def in self.trajectory.inputs:
            if inp_def.default is not None:
                merged_inputs[inp_def.name] = inp_def.default
        merged_inputs.update(inputs)
        
        # Parse variables
        initial_vars = {v.name: v.value for v in self.trajectory.variables}
            
        self.context = WorkflowContext(
            inputs=merged_inputs, 
            initial_vars=initial_vars
        )

    async def run(self) -> dict[str, Any]:
        """
        Run the full trajectory.
        
        Returns:
            The final context outputs.
        """
        try:
            await self._execute_steps(self.trajectory.steps)
            return self.context.outputs
        finally:
            # Close any pooled MCP sessions
            for executor in self.executors.values():
                if hasattr(executor, 'close'):
                    await executor.close()

    async def _execute_steps(self, steps: list[Step]):
        for step in steps:
            # 1. Evaluate common `if` condition to skip step
            if step.if_condition:
                eval_res = self.context.evaluate_expression(step.if_condition)
                if isinstance(eval_res, str) and eval_res.lower() in ("false", "0", ""):
                    eval_truthy = False
                else:
                    eval_truthy = bool(eval_res)
                    
                if not eval_truthy:
                    continue  # Skip this step completely
                    
            # 2. Handle specific step types
            if isinstance(step, IfStep):
                eval_res = self.context.evaluate_expression(step.condition)
                if isinstance(eval_res, str) and eval_res.lower() in ("false", "0", ""):
                    eval_truthy = False
                else:
                    eval_truthy = bool(eval_res)
                    
                if eval_truthy:
                    await self._execute_steps(step.then)
                elif step.else_:
                    await self._execute_steps(step.else_)
                continue
                
            elif isinstance(step, ForStep):
                 iterable = self.context.evaluate_expression(step.in_)
                 if isinstance(iterable, str):
                     try:
                         import json
                         iterable = json.loads(iterable)
                     except json.JSONDecodeError:
                         iterable = []
                         
                 if isinstance(iterable, list):
                     for item in iterable:
                         self.context.set_variable(step.item, item)
                         await self._execute_steps(step.steps)
                 continue
                 
            elif isinstance(step, SetStep):
                 for k, v in step.variables.items():
                     eval_v = self.context.evaluate_expression(v)
                     self.context.set_variable(k, eval_v)
                 continue

            elif isinstance(step, ActionStep):
                action_url = self.context.evaluate_expression(step.action)
                args = self.context.evaluate_expression(step.args or {})
                parsed_action = ActionParser.parse(action_url)
                
                if parsed_action.scheme not in self.executors:
                    raise ValueError(f"No executor configured for scheme: {parsed_action.scheme}")
                    
                executor = self.executors[parsed_action.scheme]
                result = await executor.execute(parsed_action, args)
                
                if step.id:
                     self.context.set_output(step.id, result)
                     
                if step.output_to:
                     self.context.set_variable(step.output_to, result)
