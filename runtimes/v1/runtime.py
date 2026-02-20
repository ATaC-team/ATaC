from typing import Any

from runtimes.v1.context import WorkflowContext
from runtimes.v1.executors.base import ActionExecutor
from runtimes.v1.parser import ActionParser


class WorkflowRuntime:
    """Interprets and executes ATaC format trajectories."""
    
    def __init__(self, 
                 executors: dict[str, ActionExecutor], 
                 trajectory: dict[str, Any], 
                 inputs: dict[str, Any]):
        """
        Initialize the runtime.
        
        Args:
           executors: A dict mapping scheme (e.g., 'mcp', 'bash') to its executor.
           trajectory: The loaded trajectory JSON data.
           inputs: Initial inputs provided by the user.
        """
        self.executors = executors
        self.trajectory = trajectory
        self.context = WorkflowContext(
            inputs=inputs, 
            initial_vars=trajectory.get("variables", {})
        )

    async def run(self) -> dict[str, Any]:
        """
        Run the full trajectory.
        
        Returns:
            The final context outputs.
        """
        steps = self.trajectory.get("steps", [])
        await self._execute_steps(steps)
        return self.context.outputs

    async def _execute_steps(self, steps: list[dict[str, Any]]):
        for step in steps:
            # Check condition if present
            if "if" in step:
                condition_expr = step["if"]
                # Evaluate expression. For now, assume it resolves to something truthy/falsy
                # Note: Security & true expression parsing can be complex, this evaluates as python bool
                # Ideally Jinja evaluation evaluates to a string, so we'll do a simple comparison.
                eval_res = self.context.evaluate_expression(condition_expr)
                
                # Jinja will typically output string "True" or "False", let's handle simple cases
                if isinstance(eval_res, str) and eval_res.lower() in ("false", "0", ""):
                    eval_truthy = False
                else:
                    eval_truthy = bool(eval_res)
                    
                if eval_truthy:
                    if "then" in step:
                        await self._execute_steps(step["then"])
                else:
                    if "else" in step:
                        await self._execute_steps(step["else"])
                continue # Skip the rest of this step parsing for 'if' steps
                
            elif "for" in step:
                 # Minimal 'for' loop implementation
                 if "in" in step and "item" in step and "steps" in step:
                     in_expr = step["in"]
                     item_name = step["item"]
                     loop_steps = step["steps"]
                     
                     iterable = self.context.evaluate_expression(in_expr)
                     # Attempt to parse json list if it came back as a pure string representation
                     if isinstance(iterable, str):
                         try:
                             import json
                             iterable = json.loads(iterable)
                         except json.JSONDecodeError:
                             iterable = []
                             
                     if isinstance(iterable, list):
                         for item in iterable:
                             # Overwrite the loop variable for this iteration
                             self.context.set_variable(item_name, item)
                             await self._execute_steps(loop_steps)
                 continue
                 
            elif step.get("type") == "set":
                 if "variables" in step:
                     for k, v in step["variables"].items():
                         eval_v = self.context.evaluate_expression(v)
                         self.context.set_variable(k, eval_v)
                 continue

            elif step.get("type") == "action":
                step_id = step.get("id")
                action_url = step.get("action")
                
                # Evaluate dynamic arguments
                raw_args = step.get("args", {})
                args = self.context.evaluate_expression(raw_args)
                
                # Evaluate action URL if it contains dynamic parts
                # Though usually it's static like mcp://server/tool
                action_url = self.context.evaluate_expression(action_url)
                
                parsed_action = ActionParser.parse(action_url)
                
                if parsed_action.scheme not in self.executors:
                    raise ValueError(f"No executor configured for scheme: {parsed_action.scheme}")
                    
                executor = self.executors[parsed_action.scheme]
                result = await executor.execute(parsed_action, args)
                
                # Save result if step has an id
                if step_id:
                     self.context.set_output(step_id, result)
                     
                # Handle output mapping if output_to is defined
                if "output_to" in step:
                     output_var = step["output_to"]
                     # we extract either a specific path or the whole
                     # e.g., if we had `parse_path`, we could extract it. 
                     # For simplicity right now, output_to saves the whole result into a variable
                     self.context.set_variable(output_var, result)
                     
            else:
                 # If step type is unknown but we're here, maybe it's just an action
                 # missing type. Our schema enforces "type", so realistically we shouldn't hit this.
                 pass
