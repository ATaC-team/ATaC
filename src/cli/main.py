import asyncio
import json
import sys
from pathlib import Path
from typing import Any

import click
import yaml

from src.core.atac_api import ATaC
from runtimes.v1.models import Trajectory


def load_trajectory(file_path: str) -> dict[str, Any]:
    """Helper to load a YAML or JSON trajectory."""
    path = Path(file_path)
    if not path.exists():
        click.echo(f"Error: File '{file_path}' does not exist.", err=True)
        sys.exit(1)
        
    with open(path, encoding="utf-8") as f:
        if path.suffix in (".yaml", ".yml"):
            return yaml.safe_load(f)
        return json.load(f)


def save_trajectory(file_path: str, data: dict[str, Any]):
    """Helper to save a trajectory dictionary to YAML/JSON."""
    path = Path(file_path)
    with open(path, "w", encoding="utf-8") as f:
        if path.suffix in (".yaml", ".yml"):
            yaml.dump(data, f, sort_keys=False, allow_unicode=True)
        else:
            json.dump(data, f, indent=2, ensure_ascii=False)


@click.group()
def cli():
    """ATaC: Agentic Trajectory and Control CLI."""
    pass


@cli.command()
@click.argument("file_path", type=click.Path(exists=True))
@click.option("--config", "-c", "config_paths", multiple=True, type=click.Path(exists=True), help="Path to MCP server config file (repeatable).")
@click.option("--input", "-i", "input_pairs", multiple=True, help="Input values as key=value pairs.")
def run(file_path: str, config_paths: tuple[str, ...], input_pairs: tuple[str, ...]):
    """Execute an ATaC DSL trajectory file (YAML or JSON)."""
    trajectory = load_trajectory(file_path)
    
    # Parse key=value input pairs
    inputs = {}
    for pair in input_pairs:
        if "=" not in pair:
            click.echo(f"Error: Invalid input format '{pair}', expected key=value.", err=True)
            sys.exit(1)
        key, value = pair.split("=", 1)
        inputs[key] = value
    
    extra_configs = list(config_paths) if config_paths else None
    
    try:
        outputs = asyncio.run(ATaC.execute(trajectory, inputs=inputs, mcp_config_paths=extra_configs))
        click.echo(json.dumps(outputs, indent=2, ensure_ascii=False))
    except Exception as e:
        click.echo(f"Execution Error: {str(e)}", err=True)
        sys.exit(1)


@cli.command()
@click.argument("file_path", type=click.Path(exists=True))
def param(file_path: str):
    """Extract and display parameters (inputs) required by a trajectory."""
    trajectory = load_trajectory(file_path)
            
    inputs = trajectory.get("inputs", [])
    if not inputs:
        click.echo("No inputs required.")
        return
        
    click.echo(f"Required inputs ({len(inputs)}):")
    for inp in inputs:
        # Handling depending on if it's already a parsed model or raw dict
        if isinstance(inp, dict):
            name = inp.get("name")
            inp_type = inp.get("type", "string")
            default = f" (default: {inp.get('default')})" if "default" in inp else ""
        else:
            # If it were a Pydantic model
            name = getattr(inp, "name", "")
            inp_type = getattr(inp, "type", "string")
            default_val = getattr(inp, "default", None)
            default = f" (default: {default_val})" if default_val is not None else ""
            
        click.echo(f"  - {name} [{inp_type}]{default}")


@cli.command()
def schema():
    """Print the JSON schema for ATaC trajectories."""
    click.echo(json.dumps(Trajectory.model_json_schema(), indent=2, ensure_ascii=False))


@cli.command()
@click.argument("file_path", type=click.Path())
@click.option("--name", required=True, help="Name of the trajectory.")
@click.option("--description", required=True, help="Description of the trajectory.")
def init(file_path: str, name: str, description: str):
    """Initialize a new empty ATaC trajectory file."""
    atac = ATaC(name=name, description=description)
    save_trajectory(file_path, atac.export())
    click.echo(f"Initialized ATaC trajectory at {file_path}")


@cli.command()
@click.argument("file_path", type=click.Path(exists=True))
@click.option("--name", required=True, help="Name of the input parameter.")
@click.option("--type", "type_", type=click.Choice(["string", "integer", "boolean", "float", "list", "object"]), default="string", help="Data type of the input.")
@click.option("--default", "default_val", default=None, help="Default value.")
def add_input(file_path: str, name: str, type_: str, default_val: str):
    """Add an input definition to an existing trajectory."""
    data = load_trajectory(file_path)
    atac = ATaC.from_dict(data)
    
    parsed_default = default_val
    if default_val and type_ in ("list", "object"):
        try:
            parsed_default = json.loads(default_val)
        except json.JSONDecodeError:
            click.echo(f"Warning: --default for type '{type_}' is not valid JSON, keeping as string.")
            
    atac.add_input(name, type_, default_value=parsed_default)
    save_trajectory(file_path, atac.export())
    click.echo(f"Added input '{name}' to {file_path}")


@cli.command()
@click.argument("file_path", type=click.Path(exists=True))
@click.option("--name", required=True, help="Name of the variable.")
@click.option("--type", "type_", type=click.Choice(["string", "integer", "boolean", "float", "list", "object"]), default="string", help="Data type of the variable.")
@click.option("--value", default=None, help="Initial value.")
def add_variable(file_path: str, name: str, type_: str, value: str):
    """Add a variable definition to an existing trajectory."""
    data = load_trajectory(file_path)
    atac = ATaC.from_dict(data)
    
    parsed_value = value
    if value and type_ in ("list", "object"):
        try:
            parsed_value = json.loads(value)
        except json.JSONDecodeError:
            click.echo(f"Warning: --value for type '{type_}' is not valid JSON, keeping as string.")
            
    atac.add_variable(name, type_, initial_value=parsed_value)
    save_trajectory(file_path, atac.export())
    click.echo(f"Added variable '{name}' to {file_path}")


@cli.command()
@click.argument("file_path", type=click.Path(exists=True))
@click.option("--id", "action_id", required=True, help="Unique step ID.")
@click.option("--action", required=True, help="Action URL, e.g. mcp://...")
@click.option("--args", help="JSON string representing the arguments.")
@click.option("--output-to", help="Variable to store the result.")
@click.option("--at", "at_path", default=None, help="Nested path to insert at, e.g. '0' or '0.2.then'.")
def add_action(file_path: str, action_id: str, action: str, args: str, output_to: str, at_path: str):
    """Add an action step to an existing trajectory."""
    data = load_trajectory(file_path)
    atac = ATaC.from_dict(data)
    
    parsed_args = None
    if args:
        try:
            parsed_args = json.loads(args)
        except json.JSONDecodeError:
            click.echo("Error: --args must be a valid JSON string.", err=True)
            sys.exit(1)
            
    kwargs = {}
    if output_to:
        kwargs["output_to"] = output_to
        
    atac.add_action_step(action_id, action, args=parsed_args, at_path=at_path, **kwargs)
    save_trajectory(file_path, atac.export())
    click.echo(f"Added action '{action_id}' to {file_path}" + (f" at path '{at_path}'" if at_path else ""))


@cli.command()
@click.argument("file_path", type=click.Path(exists=True))
@click.option("--var", "var_pairs", multiple=True, required=True, help="Variable assignment as key=value (repeatable).")
@click.option("--at", "at_path", default=None, help="Nested path to insert at.")
def add_set(file_path: str, var_pairs: tuple[str, ...], at_path: str):
    """Add a set step to assign variables."""
    data = load_trajectory(file_path)
    atac = ATaC.from_dict(data)
    
    variables = {}
    for pair in var_pairs:
        if "=" not in pair:
            click.echo(f"Error: Invalid format '{pair}', expected key=value.", err=True)
            sys.exit(1)
        key, value = pair.split("=", 1)
        variables[key] = value
    
    atac.add_set_step(variables, at_path=at_path)
    save_trajectory(file_path, atac.export())
    click.echo(f"Added set step to {file_path}" + (f" at path '{at_path}'" if at_path else ""))


@cli.command()
@click.argument("file_path", type=click.Path(exists=True))
@click.option("--in", "in_expr", required=True, help="Iterable expression, e.g. '${inputs.list}'.")
@click.option("--item", required=True, help="Loop variable name.")
@click.option("--at", "at_path", default=None, help="Nested path to insert at.")
def add_for(file_path: str, in_expr: str, item: str, at_path: str):
    """Add a for-loop step (empty body, use --at to fill it)."""
    data = load_trajectory(file_path)
    atac = ATaC.from_dict(data)
    atac.add_for_step(in_expr, item, at_path=at_path)
    save_trajectory(file_path, atac.export())
    click.echo(f"Added for loop (item='{item}') to {file_path}" + (f" at path '{at_path}'" if at_path else ""))


@cli.command()
@click.argument("file_path", type=click.Path(exists=True))
@click.option("--condition", required=True, help="Condition expression.")
@click.option("--at", "at_path", default=None, help="Nested path to insert at.")
def add_if(file_path: str, condition: str, at_path: str):
    """Add an if-condition step (empty then/else, use --at to fill them)."""
    data = load_trajectory(file_path)
    atac = ATaC.from_dict(data)
    atac.add_if_step(condition, at_path=at_path)
    save_trajectory(file_path, atac.export())
    click.echo(f"Added if step to {file_path}" + (f" at path '{at_path}'" if at_path else ""))


@cli.command()
@click.argument("file_path", type=click.Path(exists=True))
def show(file_path: str):
    """Show the trajectory structure with indices for navigation."""
    data = load_trajectory(file_path)
    click.echo(f"Trajectory: {data.get('meta', {}).get('name', file_path)}")
    
    steps = data.get("steps", [])
    _show_steps(steps, level=0, prefix="")


def _show_steps(steps: list[dict], level: int, prefix: str):
    for i, step in enumerate(steps):
        step_type = step.get("type")
        step_id = step.get("id", f"<no-id>")
        
        # Determine label
        if step_type == "action":
            label = f"STEP {prefix}{i} [action: {step_id}] -> {step.get('action')}"
        elif step_type == "set":
            vars_joined = ", ".join(step.get("variables", {}).keys())
            label = f"STEP {prefix}{i} [set] -> {vars_joined}"
        elif step_type == "for":
            label = f"STEP {prefix}{i} [for: {step.get('item')}] in {step.get('in')}"
        elif step_type == "if":
            label = f"STEP {prefix}{i} [if] {step.get('condition')}"
        else:
            label = f"STEP {prefix}{i} [{step_type}]"
            
        click.echo("  " * level + label)
        
        # Handle nesting
        if step_type == "for" and "steps" in step:
            _show_steps(step["steps"], level + 1, f"{prefix}{i}.")
        elif step_type == "if":
            if "then" in step and step["then"]:
                click.echo("  " * (level + 1) + "[then]")
                _show_steps(step["then"], level + 2, f"{prefix}{i}.then.")
            if "else" in step and step["else"]:
                click.echo("  " * (level + 1) + "[else]")
                _show_steps(step["else"], level + 2, f"{prefix}{i}.else.")


if __name__ == "__main__":
    cli()

