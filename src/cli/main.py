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
        
    with open(path, "r", encoding="utf-8") as f:
        if path.suffix in (".yaml", ".yml"):
            return yaml.safe_load(f)
        return json.load(f)


@click.group()
def cli():
    """ATaC: Agentic Trajectory and Control CLI."""
    pass


@cli.command()
@click.argument("file_path", type=click.Path(exists=True))
def run(file_path: str):
    """Execute an ATaC DSL trajectory file (YAML or JSON)."""
    trajectory = load_trajectory(file_path)
    
    # In a full CLI, we'd parse extra arguments as inputs
    # For now, we assume structural validation and basic execution
    try:
        outputs = asyncio.run(ATaC.execute(trajectory))
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


if __name__ == "__main__":
    cli()
