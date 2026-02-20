from typing import Any

import jinja2


class WorkflowContext:
    """Manages state, variables, and evaluation for a running trajectory."""
    
    def __init__(self, inputs: dict[str, Any], initial_vars: dict[str, Any] | None = None):
        self.inputs = inputs
        self.variables = initial_vars or {}
        self.outputs: dict[str, Any] = {}       # Accumulated (final result)
        self._latest: dict[str, Any] = {}       # Latest per step (for expressions)
        
        # Configure Jinja2 environment for evaluating expressions like ${inputs.x}
        self.env = jinja2.Environment(
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
            if step_id not in context: # avoid overwriting 'inputs' etc
                context[step_id] = {"output": output_val}
                
        # Expose variables directly to support ${var_name}
        for var_name, var_val in self.variables.items():
            if var_name not in context:
                context[var_name] = var_val
                
        return context

    def evaluate_expression(self, expr: Any) -> Any:
        """
        Recursively evaluate string templates using current state.
        
        Args:
             expr: A string containing ${...} variables, or a nested dict/list.
             
        Returns:
             The evaluated value.
        """
        if isinstance(expr, str):
             # Fast path: no template tag
             if "${" not in expr:
                 return expr
            
             # Fast path: single variable reference like "${inputs.x}" or "${variables.list}"
             # Resolve directly from context to preserve native types (list, dict, int, etc.)
             stripped = expr.strip()
             if stripped.startswith("${") and stripped.endswith("}") and stripped.count("${") == 1:
                 path = stripped[2:-1]  # e.g. "inputs.provinces"
                 ctx = self._build_context_dict()
                 try:
                     value = ctx
                     for part in path.split("."):
                         if isinstance(value, dict):
                             value = value[part]
                         else:
                             value = getattr(value, part)
                     return value
                 except (KeyError, AttributeError, TypeError):
                     pass  # Fall through to Jinja rendering
            
             # General case: Jinja template rendering
             template = self.env.from_string(expr)
             rendered = template.render(**self._build_context_dict())
             return rendered
             
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
        # Always update latest for expression resolution
        self._latest[step_id] = value
        
        # Accumulate in outputs for final result
        if step_id in self.outputs:
            existing = self.outputs[step_id]
            if isinstance(existing, list):
                existing.append(value)
            else:
                self.outputs[step_id] = [existing, value]
        else:
            self.outputs[step_id] = value

