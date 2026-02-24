import json
import logging
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from atac.cli.main import load_trajectory, save_trajectory
from atac.core.atac_api import ATaC
from atac.runtimes.v1.models import DataType, JsonValue

mcp = FastMCP("ATaC")


@mcp.tool()
async def atac_init(name: str, description: str = "") -> str:
    """
    Initialize a new empty ATaC workspace.
    Args:
        name: Name of the workspace (or file path).
        description: Description of the trajectory.
    """
    # We parse out pure names for the ATaC meta
    safe_name = Path(name).stem if ("/" in name or "." in name) else name
    
    builder = ATaC(name=safe_name, description=description)
    save_trajectory(name, builder.export())
    return f"Successfully initialized new ATaC workspace '{safe_name}' at {name}"


@mcp.tool()
async def atac_add_input(name: str, input_name: str, type: DataType = "string", default: JsonValue = None) -> str:
    """
    Add an input parameter requirement to a trajectory.
    Args:
        name: Workspace name or path.
        input_name: Name of the input variable.
        type: Data type (string, number, boolean, array, dict).
        default: Default value for the input.
    """
    traj_dict = load_trajectory(name)
    builder = ATaC.from_dict(traj_dict)
    builder.add_input(name=input_name, input_type=type, default_value=default) # type: ignore
    save_trajectory(name, builder.export())
    return f"Successfully added input '{input_name}' to {name}"


@mcp.tool()
async def atac_add_action(name: str, id: str, action: str, args: dict[str, JsonValue], at: str | None = None, if_condition: str | None = None) -> str:
    """
    Add an Action step to the trajectory.
    Args:
        name: Workspace name or path.
        id: Unique identifier for this step.
        action: Tool URI (e.g. mcp://server/tool).
        args: Dictionary of arguments for the action.
        at: Optional dot-separated path (e.g. '0.then') to insert the step.
        if_condition: Optional Jinja2 expression to conditionally execute this action.
    """
    traj_dict = load_trajectory(name)
    builder = ATaC.from_dict(traj_dict)
    builder.add_action_step(action_id=id, action=action, args=args, at_path=at, if_condition=if_condition)
    save_trajectory(name, builder.export())
    return f"Successfully added action '{id}' to {name} at position {at or 'root'}"


@mcp.tool()
async def atac_add_for(name: str, in_expr: str, item: str, at: str | None = None) -> str:
    """
    Add a For-Loop step to the trajectory. This step will initially have an empty body.
    Args:
        name: Workspace name or path.
        in_expr: Jinja2 expression evaluating to a list (e.g. '${inputs.items}').
        item: The variable name assigned to each loop iteration.
        at: Optional dot-separated path indicating where to insert this loop.
    """
    traj_dict = load_trajectory(name)
    builder = ATaC.from_dict(traj_dict)
    builder.add_for_step(in_expr=in_expr, item=item, at_path=at)
    save_trajectory(name, builder.export())
    return f"Successfully added for-loop over '{in_expr}' to {name} at position {at or 'root'}"


@mcp.tool()
async def atac_add_if(name: str, condition: str, at: str | None = None) -> str:
    """
    Add an If condition step to the trajectory. It will initially have empty 'then' and 'else' branches.
    Args:
        name: Workspace name or path.
        condition: Jinja2 logical expression to evaluate.
        at: Optional dot-separated path indicating where to insert this condition.
    """
    traj_dict = load_trajectory(name)
    builder = ATaC.from_dict(traj_dict)
    builder.add_if_step(condition=condition, at_path=at)
    save_trajectory(name, builder.export())
    return f"Successfully added if condition '{condition}' to {name} at position {at or 'root'}"


@mcp.tool()
async def atac_add_set(name: str, variables: dict[str, JsonValue], at: str | None = None) -> str:
    """
    Add a Set variables step to the trajectory.
    Args:
        name: Workspace name or path.
        variables: Dictionary mapping variable names to their values (can be Jinja2 expressions).
        at: Optional dot-separated path indicating where to insert this step.
    """
    traj_dict = load_trajectory(name)
    builder = ATaC.from_dict(traj_dict)
    builder.add_set_step(variables=variables, at_path=at)
    save_trajectory(name, builder.export())
    return f"Successfully added set variables step to {name} at position {at or 'root'}"


@mcp.tool()
async def atac_remove_step(name: str, at: str) -> str:
    """
    Remove a step from the trajectory.
    Args:
        name: Workspace name or path.
        at: The exact path to the step to remove (e.g. "0", "0.2.then.1").
    """
    traj_dict = load_trajectory(name)
    builder = ATaC.from_dict(traj_dict)
    try:
        builder.remove_step(at_path=at)
        save_trajectory(name, builder.export())
        return f"Successfully removed step at path '{at}' from {name}"
    except ValueError as e:
        return f"Error removing step: {str(e)}"


@mcp.tool()
async def atac_show(name: str) -> str:
    """
    Display the current structure and contents of a trajectory file.
    Args:
        name: Workspace name or path.
    """
    traj_dict = load_trajectory(name)
    return json.dumps(traj_dict, indent=2, ensure_ascii=False)


@mcp.tool()
async def atac_run(name: str, inputs: dict[str, JsonValue] | None = None, config_paths: list[str] | None = None) -> str:
    """
    Execute a constructed ATaC trajectory file.
    Args:
        name: Workspace name or path.
        inputs: Dictionary of input values matching the trajectory's requirements.
        config_paths: Optional paths to MCP server config JSON files.
    """
    traj_dict = load_trajectory(name)
    try:
        logging.info(f"Running trajectory {name} with inputs: {inputs}")
        outputs = await ATaC.execute(
            trajectory=traj_dict,
            inputs=inputs or {},
            mcp_config_paths=config_paths
        )
        return json.dumps(outputs, indent=2, ensure_ascii=False)
    except Exception as e:
        return f"Execution failed: {str(e)}"


@mcp.prompt("atac-instructions")
def atac_instructions() -> str:
    """Get the usage instructions and examples for the ATaC Agent Skills via MCP tools."""
    skill_path = Path(__file__).parent / "INSTRUCTIONS.md"
    if skill_path.exists():
        return skill_path.read_text(encoding="utf-8")
    return "ATaC instructions not found."


@mcp.resource("atac://schema")
def atac_schema() -> str:
    """Get the JSON schema for ATaC trajectories."""
    schema_path = Path(__file__).parent.parent / "specs" / "v1" / "schema.json"
    if schema_path.exists():
        return schema_path.read_text(encoding="utf-8")
    return "ATaC schema not found."


if __name__ == "__main__":
    mcp.run()
