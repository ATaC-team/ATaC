import asyncio
import json
import sys
from pathlib import Path

import click

from atac.core.atac_api import ATaC
from atac.runtimes.v1.models import Trajectory


@click.group()
@click.option(
    "--cwd",
    "-C",
    type=click.Path(exists=True, file_okay=False, dir_okay=True),
    help="Execute commands within this specific directory.",
)
@click.pass_context
def cli(ctx: click.Context, cwd: str | None):
    """ATaC: Agentic Trajectory and Control CLI."""
    ctx.ensure_object(dict)
    if cwd:
        import os

        os.chdir(cwd)


@cli.command()
@click.argument("pairs", nargs=-1)
def config(pairs: tuple[str, ...]):
    """Set workspace configuration values using k=v format (e.g. mcp_config=path1 mcp_config=path2)."""
    if not pairs:
        click.echo("Usage: atac config key=value [key=value ...]")
        sys.exit(1)

    atac_dir = Path(".atac")
    atac_dir.mkdir(exist_ok=True)

    config_path = atac_dir / "atac.json"
    data = {}
    if config_path.exists():
        try:
            with open(config_path, encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            pass

    for pair in pairs:
        if "=" not in pair:
            click.echo(
                f"Error: Invalid configuration format '{pair}'. Expected key=value.",
                err=True,
            )
            sys.exit(1)

        key, value = pair.split("=", 1)

        # If key already exists, convert to list or append
        if key in data:
            if isinstance(data[key], list):
                # Only append if not duplicated
                if value not in data[key]:
                    data[key].append(value)
            elif data[key] != value:
                # Convert scalar to list
                data[key] = [data[key], value]
        else:
            data[key] = value

    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    click.echo("Saved configuration to .atac/atac.json")


@cli.command()
def ui():
    """Launch the ATaC Visual Builder UI."""
    import os
    import sys
    from pathlib import Path

    import atac
    from atac.cli.ui_server import start_server

    # Locate the ui_static directory relative to the atac package root
    atac_pkg_dir = Path(atac.__file__).parent
    ui_dir = atac_pkg_dir / "ui_static"

    if not ui_dir.exists() or not (ui_dir / "index.html").exists():
        click.echo(
            "Error: Could not locate the 'ui_static' directory. Please ensure ATaC is installed with the built UI components.",
            err=True,
        )
        sys.exit(1)

    cwd = os.getcwd()
    os.environ["ATAC_WORKSPACE_DIR"] = cwd

    click.echo(f"Starting ATaC UI for workspace directory: {cwd}")

    try:
        # Start the Python UI server (blocking call, simple single-threaded HTTP server)
        # It handles API routes and serves the static files from ui_static
        start_server(port=3001, open_browser=True)
    except KeyboardInterrupt:
        click.echo("\nShutting down UI...")


@cli.command()
@click.argument("name")
@click.option(
    "--config",
    "-c",
    "config_paths",
    multiple=True,
    help="Path to MCP server config file (can be repeated).",
)
@click.option(
    "--input",
    "-i",
    "input_pairs",
    multiple=True,
    help="Input values as key=value pairs.",
)
def run(name: str, config_paths: tuple[str, ...], input_pairs: tuple[str, ...]):
    """Execute an ATaC DSL trajectory workspace (or file)."""
    trajectory = ATaC.load_trajectory(name)

    # Parse key=value input pairs
    inputs = {}
    for pair in input_pairs:
        if "=" not in pair:
            click.echo(
                f"Error: Invalid input format '{pair}', expected key=value.", err=True
            )
            sys.exit(1)
        key, value = pair.split("=", 1)
        inputs[key] = value

    extra_configs = list(config_paths) if config_paths else None

    try:
        outputs = asyncio.run(
            ATaC.execute(trajectory, inputs=inputs, mcp_config_paths=extra_configs)
        )
        click.echo(json.dumps(outputs, indent=2, ensure_ascii=False))
    except Exception as e:
        click.echo(f"Execution Error: {str(e)}", err=True)
        sys.exit(1)


@cli.command()
@click.argument("name")
def param(name: str):
    """Extract and display parameters (inputs) required by a trajectory workspace."""
    trajectory = ATaC.load_trajectory(name)

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


@cli.command(name="list")
def list_workspaces():
    """List all ATaC workspaces in the current directory."""
    workspaces = ATaC.get_workspaces()
    if not workspaces:
        click.echo("No workspaces found in .atac/")
        return

    click.echo(f"Found {len(workspaces)} workspace(s):\n")
    for ws in workspaces:
        dir_name = ws["directory"]
        name = ws["name"]
        desc = ws["description"]
        # If the directory name equals the meta name, just print it once to avoid redundancy
        display_name = dir_name if dir_name == name else f"{dir_name} ({name})"
        click.echo(f"  - {display_name}")
        click.echo(f"    Description: {desc}")
        click.echo("")


@cli.command()
@click.argument("name")
@click.option(
    "--description",
    default="ATaC workspace",
    help="Description of the trajectory workspace.",
)
def init(name: str, description: str):
    """Initialize a new ATaC workspace under .atac/<name>/index.yaml."""
    # We parse out pure names for the ATaC meta, fallback to file stems if raw paths passed
    safe_name = Path(name).stem if ("/" in name or "." in name) else name

    atac = ATaC(name=safe_name, description=description)
    ATaC.save_trajectory(name, atac.export())

    resolved_path = ATaC.resolve_workspace_path(name)
    click.echo(f"Initialized ATaC workspace '{safe_name}' at {resolved_path}")


@cli.command()
@click.argument("name")
@click.option(
    "--name", "input_name", required=True, help="Name of the input parameter."
)
@click.option(
    "--type",
    "type_",
    type=click.Choice(["string", "integer", "boolean", "float", "list", "object"]),
    default="string",
    help="Data type of the input.",
)
@click.option("--default", "default_val", default=None, help="Default value.")
def add_input(name: str, input_name: str, type_: str, default_val: str):
    """Add an input definition to an existing workspace."""
    data = ATaC.load_trajectory(name)
    atac = ATaC.from_dict(data)

    parsed_default = default_val
    if default_val and type_ in ("list", "object"):
        try:
            parsed_default = json.loads(default_val)
        except json.JSONDecodeError:
            click.echo(
                f"Warning: --default for type '{type_}' is not valid JSON, keeping as string."
            )

    atac.add_input(input_name, type_, default_value=parsed_default)
    ATaC.save_trajectory(name, atac.export())
    click.echo(f"Added input '{input_name}' to workspace '{name}'")


@cli.command()
@click.argument("name")
@click.option("--name", "var_name", required=True, help="Name of the variable.")
@click.option(
    "--type",
    "type_",
    type=click.Choice(["string", "integer", "boolean", "float", "list", "object"]),
    default="string",
    help="Data type of the variable.",
)
@click.option("--value", default=None, help="Initial value.")
def add_variable(name: str, var_name: str, type_: str, value: str):
    """Add a variable definition to an existing workspace."""
    data = ATaC.load_trajectory(name)
    atac = ATaC.from_dict(data)

    parsed_value = value
    if value and type_ in ("list", "object"):
        try:
            parsed_value = json.loads(value)
        except json.JSONDecodeError:
            click.echo(
                f"Warning: --value for type '{type_}' is not valid JSON, keeping as string."
            )

    atac.add_variable(var_name, type_, initial_value=parsed_value)
    ATaC.save_trajectory(name, atac.export())
    click.echo(f"Added variable '{var_name}' to workspace '{name}'")


@cli.command()
@click.argument("name")
@click.option("--id", "action_id", required=True, help="Unique step ID.")
@click.option("--action", required=True, help="Action URL, e.g. mcp://...")
@click.option("--args", help="JSON string representing the arguments.")
@click.option("--output-to", help="Variable to store the result.")
@click.option(
    "--at",
    "at_path",
    default=None,
    help="Nested path to insert at, e.g. '0' or '0.2.then'.",
)
def add_action(
    name: str, action_id: str, action: str, args: str, output_to: str, at_path: str
):
    """Add an action step to an existing workspace."""
    data = ATaC.load_trajectory(name)
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
    ATaC.save_trajectory(name, atac.export())
    click.echo(
        f"Added action '{action_id}' to workspace '{name}'"
        + (f" at path '{at_path}'" if at_path else "")
    )


@cli.command()
@click.argument("name")
@click.option(
    "--var",
    "var_pairs",
    multiple=True,
    required=True,
    help="Variable assignment as key=value (repeatable).",
)
@click.option("--at", "at_path", default=None, help="Nested path to insert at.")
def add_set(name: str, var_pairs: tuple[str, ...], at_path: str):
    """Add a set step to assign variables."""
    data = ATaC.load_trajectory(name)
    atac = ATaC.from_dict(data)

    variables = {}
    for pair in var_pairs:
        if "=" not in pair:
            click.echo(f"Error: Invalid format '{pair}', expected key=value.", err=True)
            sys.exit(1)
        key, value = pair.split("=", 1)
        variables[key] = value

    atac.add_set_step(variables, at_path=at_path)
    ATaC.save_trajectory(name, atac.export())
    click.echo(
        f"Added set step to workspace '{name}'"
        + (f" at path '{at_path}'" if at_path else "")
    )


@cli.command()
@click.argument("name")
@click.option(
    "--in", "in_expr", required=True, help="Iterable expression, e.g. '${inputs.list}'."
)
@click.option("--item", "loop_item", required=True, help="Loop variable name.")
@click.option("--at", "at_path", default=None, help="Nested path to insert at.")
def add_for(name: str, in_expr: str, loop_item: str, at_path: str):
    """Add a for-loop step (empty body, use --at to fill it)."""
    data = ATaC.load_trajectory(name)
    atac = ATaC.from_dict(data)
    atac.add_for_step(in_expr, loop_item, at_path=at_path)
    ATaC.save_trajectory(name, atac.export())
    click.echo(
        f"Added for loop (item='{loop_item}') to workspace '{name}'"
        + (f" at path '{at_path}'" if at_path else "")
    )


@cli.command()
@click.argument("name")
@click.option("--condition", required=True, help="Condition expression.")
@click.option("--at", "at_path", default=None, help="Nested path to insert at.")
def add_if(name: str, condition: str, at_path: str):
    """Add an if-condition step (empty then/else, use --at to fill them)."""
    data = ATaC.load_trajectory(name)
    atac = ATaC.from_dict(data)
    atac.add_if_step(condition, at_path=at_path)
    ATaC.save_trajectory(name, atac.export())
    click.echo(
        f"Added if step to workspace '{name}'"
        + (f" at path '{at_path}'" if at_path else "")
    )


@cli.command()
@click.argument("name")
@click.option(
    "--at",
    "at_path",
    required=True,
    help="Nested path of the step to remove (e.g. '0' or '0.2.then.1').",
)
def rm(name: str, at_path: str):
    """Remove a specific step from a trajectory."""
    data = ATaC.load_trajectory(name)
    atac = ATaC.from_dict(data)
    try:
        atac.remove_step(at_path)
        ATaC.save_trajectory(name, atac.export())
        click.echo(f"Successfully removed step '{at_path}' from workspace '{name}'")
    except ValueError as e:
        click.echo(f"Error removing step: {e}", err=True)
        sys.exit(1)


@cli.command()
@click.argument("name")
def show(name: str):
    """Show the trajectory structure with indices for navigation."""
    data = ATaC.load_trajectory(name)
    click.echo(f"Trajectory Workspace: {data.get('meta', {}).get('name', name)}")

    steps = data.get("steps", [])
    _show_steps(steps, level=0, prefix="")


def _show_steps(steps: list[dict], level: int, prefix: str):
    for i, step in enumerate(steps):
        step_type = step.get("type")
        step_id = step.get("id", "<no-id>")

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


@cli.command()
def mcp():
    """Start the ATaC MCP server over stdio."""
    from atac.mcp.server import mcp as mcp_server

    mcp_server.run()


if __name__ == "__main__":
    cli()
