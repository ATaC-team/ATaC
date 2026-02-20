"""ATaC configuration: env-based MCP server config paths + loader."""
import json
from pathlib import Path
from typing import Any

import yaml
from mcp import StdioServerParameters
from pydantic_settings import BaseSettings


class AtacSettings(BaseSettings):
    """ATaC global settings, populated from environment variables.
    
    Environment Variables:
        ATAC_MCP_SERVER_CONFIGS: Comma-separated list of paths to MCP server
                                  config files (YAML or JSON).
    """
    atac_mcp_server_configs: str = ""

    model_config = {"env_prefix": ""}


# Singleton
settings = AtacSettings()


def get_mcp_config_paths() -> list[str]:
    """Return the list of MCP server config file paths from env."""
    raw = settings.atac_mcp_server_configs.strip()
    if not raw:
        return []
    return [p.strip() for p in raw.split(",") if p.strip()]


def _load_file(path: Path) -> dict[str, Any]:
    """Load a YAML or JSON file."""
    with open(path, encoding="utf-8") as f:
        if path.suffix == ".json":
            return json.load(f)
        return yaml.safe_load(f) or {}


def _extract_servers(config: dict[str, Any], source: str) -> dict[str, StdioServerParameters]:
    """
    Extract MCP server definitions from a config dict.
    
    Supports two formats:
      - Standard MCP JSON: {"mcpServers": {"name": {"command": ..., "disabled": false}}}
      - ATaC YAML:         {"mcp_servers": {"name": {"command": ...}}}
    """
    # Try standard MCP JSON format first (mcpServers), then ATaC YAML (mcp_servers)
    servers_raw = config.get("mcpServers") or config.get("mcp_servers") or {}
    
    servers: dict[str, StdioServerParameters] = {}
    for name, spec in servers_raw.items():
        # Skip disabled servers
        if spec.get("disabled", False):
            continue
        
        command = spec.get("command")
        if not command:
            raise ValueError(f"MCP server '{name}' in '{source}' missing 'command'.")
        
        servers[name] = StdioServerParameters(
            command=command,
            args=spec.get("args", []),
            env=spec.get("env"),
        )
    
    return servers


def load_mcp_servers(extra_paths: list[str] | None = None) -> dict[str, StdioServerParameters]:
    """
    Load and merge MCP server definitions from all configured paths.
    
    Paths from ATAC_MCP_SERVER_CONFIGS env var are loaded first,
    then extra_paths are merged on top.
    """
    paths = get_mcp_config_paths()
    if extra_paths:
        paths.extend(extra_paths)
    
    servers: dict[str, StdioServerParameters] = {}
    
    for path_str in paths:
        path = Path(path_str)
        if not path.exists():
            raise FileNotFoundError(f"MCP config file not found: {path_str}")
        
        config = _load_file(path)
        servers.update(_extract_servers(config, path_str))
    
    return servers

