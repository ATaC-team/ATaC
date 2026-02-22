import json
import logging
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import FastMCP

from atac.cli.main import load_trajectory, save_trajectory
from atac.core.atac_api import ATaC

mcp = FastMCP("ATaC")


@mcp.tool()
async def atac_init(file_path: str, name: str = "", description: str = "") -> str:
    """
    Initialize a new empty ATaC trajectory file.
    Args:
        file_path: Absolute or relative path to the output yaml/json file.
        name: Name of the trajectory.
        description: Description of the trajectory.
    """
    path = Path(file_path)
    if path.exists():
        return f"Warning: File {file_path} already exists. Initialization aborted."
    
    builder = ATaC(name=name, description=description)
    save_trajectory(file_path, builder.export())
    return f"Successfully initialized new ATaC trajectory at {file_path}"


@mcp.tool()
async def atac_add_input(file_path: str, name: str, type: str = "string", default: Any = None) -> str:
    """
    Add an input parameter requirement to a trajectory.
    Args:
        file_path: Path to the trajectory file.
        name: Name of the input variable.
        type: Data type (string, number, boolean, array, dict).
        default: Default value for the input.
    """
    traj_dict = load_trajectory(file_path)
    builder = ATaC.from_dict(traj_dict)
    builder.add_input(name=name, input_type=type, default_value=default) # type: ignore
    save_trajectory(file_path, builder.export())
    return f"Successfully added input '{name}' to {file_path}"


@mcp.tool()
async def atac_add_action(file_path: str, id: str, action: str, args: dict[str, Any], at: str | None = None, if_condition: str | None = None) -> str:
    """
    Add an Action step to the trajectory.
    Args:
        file_path: Path to the trajectory file.
        id: Unique identifier for this step.
        action: Tool URI (e.g. mcp://server/tool).
        args: Dictionary of arguments for the action.
        at: Optional dot-separated path (e.g. '0.then') to insert the step.
        if_condition: Optional Jinja2 expression to conditionally execute this action.
    """
    traj_dict = load_trajectory(file_path)
    builder = ATaC.from_dict(traj_dict)
    builder.add_action_step(action_id=id, action=action, args=args, at_path=at, if_condition=if_condition)
    save_trajectory(file_path, builder.export())
    return f"Successfully added action '{id}' to {file_path} at position {at or 'root'}"


@mcp.tool()
async def atac_add_for(file_path: str, in_expr: str, item: str, at: str | None = None) -> str:
    """
    Add a For-Loop step to the trajectory. This step will initially have an empty body.
    Args:
        file_path: Path to the trajectory file.
        in_expr: Jinja2 expression evaluating to a list (e.g. '${inputs.items}').
        item: The variable name assigned to each loop iteration.
        at: Optional dot-separated path indicating where to insert this loop.
    """
    traj_dict = load_trajectory(file_path)
    builder = ATaC.from_dict(traj_dict)
    builder.add_for_step(in_expr=in_expr, item=item, at_path=at)
    save_trajectory(file_path, builder.export())
    return f"Successfully added for-loop over '{in_expr}' to {file_path} at position {at or 'root'}"


@mcp.tool()
async def atac_add_if(file_path: str, condition: str, at: str | None = None) -> str:
    """
    Add an If condition step to the trajectory. It will initially have empty 'then' and 'else' branches.
    Args:
        file_path: Path to the trajectory file.
        condition: Jinja2 logical expression to evaluate.
        at: Optional dot-separated path indicating where to insert this condition.
    """
    traj_dict = load_trajectory(file_path)
    builder = ATaC.from_dict(traj_dict)
    builder.add_if_step(condition=condition, at_path=at)
    save_trajectory(file_path, builder.export())
    return f"Successfully added if condition '{condition}' to {file_path} at position {at or 'root'}"


@mcp.tool()
async def atac_add_set(file_path: str, variables: dict[str, Any], at: str | None = None) -> str:
    """
    Add a Set variables step to the trajectory.
    Args:
        file_path: Path to the trajectory file.
        variables: Dictionary mapping variable names to their values (can be Jinja2 expressions).
        at: Optional dot-separated path indicating where to insert this step.
    """
    traj_dict = load_trajectory(file_path)
    builder = ATaC.from_dict(traj_dict)
    builder.add_set_step(variables=variables, at_path=at)
    save_trajectory(file_path, builder.export())
    return f"Successfully added set variables step to {file_path} at position {at or 'root'}"


@mcp.tool()
async def atac_show(file_path: str) -> str:
    """
    Display the current structure and contents of a trajectory file.
    Args:
        file_path: Path to the trajectory file.
    """
    traj_dict = load_trajectory(file_path)
    return json.dumps(traj_dict, indent=2, ensure_ascii=False)


@mcp.tool()
async def atac_run(file_path: str, inputs: dict[str, Any] | None = None, config_paths: list[str] | None = None) -> str:
    """
    Execute a constructed ATaC trajectory file.
    Args:
        file_path: Path to the trajectory file.
        inputs: Dictionary of input values matching the trajectory's requirements.
        config_paths: Optional paths to MCP server config JSON files.
    """
    traj_dict = load_trajectory(file_path)
    try:
        logging.info(f"Running trajectory {file_path} with inputs: {inputs}")
        outputs = await ATaC.execute(
            trajectory=traj_dict,
            inputs=inputs or {},
            mcp_config_paths=config_paths
        )
        return json.dumps(outputs, indent=2, ensure_ascii=False)
    except Exception as e:
        return f"Execution failed: {str(e)}"


if __name__ == "__main__":
    mcp.run()
