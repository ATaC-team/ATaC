import asyncio
import json
import sys
from pathlib import Path
from typing import Any

import click
import yaml

from src.core.atac_api import ATaC


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
        click.echo(json.dumps(outputs, indent=2))
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
@click.option("--type", "type_", default="string", help="Data type of the input.")
@click.option("--default", "default_val", default=None, help="Default value.")
def add_input(file_path: str, name: str, type_: str, default_val: str):
    """Add an input definition to an existing trajectory."""
    data = load_trajectory(file_path)
    atac = ATaC.from_dict(data)
    atac.add_input(name, type_, default_value=default_val)
    save_trajectory(file_path, atac.export())
    click.echo(f"Added input '{name}' to {file_path}")


@cli.command()
@click.argument("file_path", type=click.Path(exists=True))
@click.option("--name", required=True, help="Name of the variable.")
@click.option("--type", "type_", default="string", help="Data type of the variable.")
@click.option("--value", default=None, help="Initial value.")
def add_variable(file_path: str, name: str, type_: str, value: str):
    """Add a variable definition to an existing trajectory."""
    data = load_trajectory(file_path)
    atac = ATaC.from_dict(data)
    atac.add_variable(name, type_, initial_value=value)
    save_trajectory(file_path, atac.export())
    click.echo(f"Added variable '{name}' to {file_path}")


@cli.command()
@click.argument("file_path", type=click.Path(exists=True))
@click.option("--id", "action_id", required=True, help="Unique step ID.")
@click.option("--action", required=True, help="Action URL, e.g. mcp://...")
@click.option("--args", help="JSON string representing the arguments.")
@click.option("--output-to", help="Variable to store the result.")
def add_action(file_path: str, action_id: str, action: str, args: str, output_to: str):
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
        
    atac.add_action_step(action_id, action, args=parsed_args, **kwargs)
    save_trajectory(file_path, atac.export())
    click.echo(f"Added action '{action_id}' to {file_path}")


if __name__ == "__main__":
    cli()
