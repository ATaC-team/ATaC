from typing import Any

import jinja2


class WorkflowContext:
    """Manages state, variables, and evaluation for a running trajectory."""
    
    def __init__(self, inputs: dict[str, Any], initial_vars: dict[str, Any] | None = None):
        self.inputs = inputs
        self.variables = initial_vars or {}
        self.outputs: dict[str, Any] = {}
        
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
            "outputs": self.outputs
        }
        # Expose step outputs directly to support ${step_id.output.field}
        for step_id, output_val in self.outputs.items():
            if step_id not in context: # avoid overwriting 'inputs' etc
                context[step_id] = {"output": output_val}
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
            
             # Create template and render
             template = self.env.from_string(expr)
             rendered = template.render(**self._build_context_dict())
             
             # If the rendered string looks like a standard type conversion could apply,
             # we might want to cast it (e.g., "True" -> True), but for now return string as per standard Jinja behavior.
             # Note: For complex objects, Jinja strings might not be enough, 
             # but keeping it simple for the DSL.
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
        """Record the output of a step."""
        self.outputs[step_id] = value
