"""ATaC CLI entrypoint."""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any

import click
import uvicorn
import yaml

from atac.bootstrap import load_service_from_bootstrap
from atac.http_server import create_app
from atac.mcp.server import (
    AtacMCPTools,
    create_mcp_server,
    load_mcp_service_from_env,
)
from atac.service import AtacService
from atac.ui import serve_ui


@click.group()
def cli() -> None:
    """ATaC command line interface."""


@cli.group(name="service")
def service_group() -> None:
    """Manage ATaC runtime service."""


@service_group.command(name="start")
@click.option(
    "--bootstrap",
    required=True,
    envvar="ATAC_BOOTSTRAP",
    help="Service bootstrap callable in '<module_path>:<callable_name>' format.",
)
@click.option("--host", default="127.0.0.1", show_default=True, help="Bind host.")
@click.option("--port", default=8787, type=int, show_default=True, help="Bind port.")
def service_start(bootstrap: str, host: str, port: int) -> None:
    """Start ATaC HTTP service with user-provided bootstrap."""
    service = load_service_from_bootstrap(bootstrap)
    app = create_app(service)
    click.echo(f"ATaC service starting on http://{host}:{port}")
    uvicorn.run(app, host=host, port=port)


@cli.command(name="mcp")
@click.option(
    "--atac-dir",
    envvar="ATAC_DIR",
    required=True,
    help="Directory used to store and load graph packages for MCP.",
)
@click.option(
    "--server-name",
    default="ATaC",
    show_default=True,
    help="MCP server name.",
)
def mcp_command(
    atac_dir: str,
    server_name: str,
) -> None:
    """Start the ATaC MCP server over stdio."""
    service = load_mcp_service_from_env()
    create_mcp_server(service, atac_dir=atac_dir, server_name=server_name).run()


@cli.command(name="ui")
@click.option("--host", default="127.0.0.1", show_default=True, help="Bind host.")
@click.option("--port", default=4173, type=int, show_default=True, help="Bind port.")
@click.option(
    "--open/--no-open",
    "open_browser",
    default=True,
    show_default=True,
    help="Open the UI in the default browser automatically.",
)
def ui_command(host: str, port: int, open_browser: bool) -> None:
    """Start the packaged audit UI."""
    serve_ui(host=host, port=port, open_browser=open_browser)


@cli.group(name="graph")
def graph_group() -> None:
    """Manage and run saved ATaC graphs."""


@graph_group.command(name="list")
@click.option(
    "--atac-dir",
    envvar="ATAC_DIR",
    required=True,
    help="Directory used to store and load graph packages.",
)
def graph_list_command(atac_dir: str) -> None:
    """List all saved graph descriptions under ATAC_DIR."""
    graphs = _build_graph_tools(atac_dir=atac_dir).list_graph()
    click.echo(json.dumps(_to_json_compatible(graphs), ensure_ascii=False, indent=2))


@graph_group.command(name="get")
@click.argument("name")
@click.option(
    "--atac-dir",
    envvar="ATAC_DIR",
    required=True,
    help="Directory used to store and load graph packages.",
)
@click.option(
    "--include-code/--no-include-code",
    default=False,
    show_default=True,
    help="Include graph source code in the output.",
)
def graph_get_command(name: str, atac_dir: str, include_code: bool) -> None:
    """Return saved graph metadata and optionally graph source code."""
    graph = _build_graph_tools(atac_dir=atac_dir).get_graph(name, include_code=include_code)
    click.echo(json.dumps(_to_json_compatible(graph), ensure_ascii=False, indent=2))


@graph_group.command(name="run")
@click.argument("graph_spec")
@click.option(
    "--input",
    "input_pairs",
    multiple=True,
    help="Initial graph state in key=value format. Can be repeated.",
)
@click.option(
    "--bootstrap",
    envvar="ATAC_BOOTSTRAP",
    help="Bootstrap callable for tool registration ('module:function').",
)
@click.option(
    "--atac-dir",
    envvar="ATAC_DIR",
    help="Graph package directory for name-based graph lookup.",
)
def graph_run_command(
    graph_spec: str,
    input_pairs: tuple[str, ...],
    bootstrap: str | None,
    atac_dir: str | None,
) -> None:
    """Run a saved graph by name or a graph loaded from <module:function>."""
    result = _run_graph(
        graph_spec=graph_spec,
        input_pairs=input_pairs,
        bootstrap=bootstrap,
        atac_dir=atac_dir,
    )
    click.echo(json.dumps(_to_json_compatible(result), ensure_ascii=False, indent=2))


@cli.command(name="tool_call")
@click.argument("tool_name")
@click.option(
    "--arg",
    "arg_pairs",
    multiple=True,
    help="Argument pair in key=value format. Can be repeated.",
)
def tool_call_command(tool_name: str, arg_pairs: tuple[str, ...]) -> None:
    """Call a registered tool directly and print JSON output."""
    parsed_args = _parse_key_value_pairs(arg_pairs, option_name="--arg")
    bootstrap = _resolve_bootstrap_from_env()
    service = _build_local_service(bootstrap=bootstrap)

    try:
        raw = service.tool_call(tool_name, parsed_args)
    except KeyError as exc:
        raise click.ClickException(str(exc)) from exc
    except Exception as exc:
        payload = {
            "ok": False,
            "tool": tool_name,
            "result": None,
            "error": {"reason": "tool_exception", "detail": str(exc)},
        }
        click.echo(json.dumps(payload, ensure_ascii=False, indent=2))
        raise click.ClickException("Tool call failed") from exc

    payload = {
        "ok": True,
        "tool": tool_name,
        "result": _to_json_compatible(raw),
        "error": None,
    }
    click.echo(json.dumps(payload, ensure_ascii=False, indent=2))


def _build_local_service(bootstrap: str | None) -> AtacService:
    if bootstrap:
        return load_service_from_bootstrap(bootstrap)
    return AtacService()


def _build_graph_tools(*, atac_dir: str, bootstrap: str | None = None) -> AtacMCPTools:
    service = _build_local_service(bootstrap=bootstrap)
    return AtacMCPTools(service=service, atac_dir=atac_dir)


def _run_graph(
    *,
    graph_spec: str,
    input_pairs: tuple[str, ...],
    bootstrap: str | None,
    atac_dir: str | None,
) -> Any:
    state = _parse_input_pairs(input_pairs)
    if atac_dir:
        return asyncio.run(
            _build_graph_tools(atac_dir=atac_dir, bootstrap=bootstrap).run_graph(
                graph_spec,
                state,
            )
        )

    service = _build_local_service(bootstrap=bootstrap)
    return asyncio.run(service.arun_graph(graph_spec, state))


def _parse_input_pairs(input_pairs: tuple[str, ...]) -> dict[str, Any]:
    return _parse_key_value_pairs(input_pairs, option_name="--input")


def _parse_key_value_pairs(pairs: tuple[str, ...], option_name: str) -> dict[str, Any]:
    parsed: dict[str, Any] = {}
    for pair in pairs:
        if "=" not in pair:
            raise click.BadParameter(f"Each {option_name} must be in key=value format")
        key, raw_value = pair.split("=", maxsplit=1)
        if not key:
            raise click.BadParameter("Input key cannot be empty")
        parsed[key] = yaml.safe_load(raw_value)
    return parsed


def _to_json_compatible(value: Any) -> Any:
    try:
        json.dumps(value, ensure_ascii=False)
        return value
    except (TypeError, ValueError):
        return str(value)


def _resolve_bootstrap_from_env() -> str:
    bootstrap = os.environ.get("ATAC_BOOTSTRAP")
    if bootstrap:
        return bootstrap
    raise click.ClickException("ATAC_BOOTSTRAP is required for tool_call")


if __name__ == "__main__":
    cli()
