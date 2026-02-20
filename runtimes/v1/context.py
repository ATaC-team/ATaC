from typing import Any

from jinja2.nativetypes import NativeEnvironment


class WorkflowContext:
    """Manages state, variables, and evaluation for a running trajectory."""
    
    def __init__(self, inputs: dict[str, Any], initial_vars: dict[str, Any] | None = None):
        self.inputs = inputs
        self.variables = initial_vars or {}
        self.outputs: dict[str, Any] = {}       # Accumulated (final result)
        self._latest: dict[str, Any] = {}       # Latest per step (for expressions)
        
        # NativeEnvironment preserves Python native types (list, dict, bool, int)
        # instead of converting everything to strings like the standard Environment.
        self.env = NativeEnvironment(
            variable_start_string="${",
            variable_end_string="}"
        )

    def _build_context_dict(self) -> dict[str, Any]:
        """Build the dictionary used for template evaluation."""
        context = {
            "inputs": self.inputs,
            "variables": self.variables,
            "outputs": self._latest
        }
        # Expose step outputs directly to support ${step_id.output.field}
        for step_id, output_val in self._latest.items():
            if step_id not in context:
                context[step_id] = {"output": output_val}
                
        # Expose variables directly to support ${var_name}
        for var_name, var_val in self.variables.items():
            if var_name not in context:
                context[var_name] = var_val
                
        return context

    def evaluate_expression(self, expr: Any) -> Any:
        """
        Recursively evaluate string templates using current state.
        
        Uses Jinja2 NativeEnvironment so expressions like ${inputs.list}
        return actual Python lists/dicts/bools instead of string representations.
        """
        if isinstance(expr, str):
             if "${" not in expr:
                 return expr
            
             template = self.env.from_string(expr)
             return template.render(**self._build_context_dict())
             
        elif isinstance(expr, dict):
            return {k: self.evaluate_expression(v) for k, v in expr.items()}
            
        elif isinstance(expr, list):
            return [self.evaluate_expression(item) for item in expr]
            
        return expr

    def set_variable(self, name: str, value: Any):
        """Set a user-defined variable."""
        self.variables[name] = value
        
    def set_output(self, step_id: str, value: Any):
        """Record the output of a step. Latest value is used for expressions; all values accumulate in outputs."""
        self._latest[step_id] = value
        
        if step_id in self.outputs:
            existing = self.outputs[step_id]
            if isinstance(existing, list):
                existing.append(value)
            else:
                self.outputs[step_id] = [existing, value]
        else:
            self.outputs[step_id] = value
