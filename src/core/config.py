"""ATaC configuration: env-based MCP server config paths + loader."""
from pathlib import Path
from typing import Any

import yaml
from mcp import StdioServerParameters
from pydantic_settings import BaseSettings


class AtacSettings(BaseSettings):
    """ATaC global settings, populated from environment variables.
    
    Environment Variables:
        ATAC_MCP_SERVER_CONFIGS: Comma-separated list of paths to MCP server
                                  config files (YAML). Each file defines one
                                  or more MCP servers.
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


def load_mcp_servers(extra_paths: list[str] | None = None) -> dict[str, StdioServerParameters]:
    """
    Load and merge MCP server definitions from all configured paths.
    
    Args:
        extra_paths: Additional config paths (e.g. from CLI --config).
                     Merged on top of env-configured paths.
    
    Config file format:
        mcp_servers:
          amap-maps:
            command: npx
            args: ["-y", "@amap/amap-maps-mcp-server"]
            env:
              AMAP_MAPS_API_KEY: "xxx"
    """
    paths = get_mcp_config_paths()
    if extra_paths:
        paths.extend(extra_paths)
    
    servers: dict[str, StdioServerParameters] = {}
    
    for path_str in paths:
        path = Path(path_str)
        if not path.exists():
            raise FileNotFoundError(f"MCP config file not found: {path_str}")
        
        with open(path, encoding="utf-8") as f:
            config: dict[str, Any] = yaml.safe_load(f) or {}
        
        for name, spec in config.get("mcp_servers", {}).items():
            command = spec.get("command")
            if not command:
                raise ValueError(f"MCP server '{name}' in '{path_str}' missing 'command'.")
            
            servers[name] = StdioServerParameters(
                command=command,
                args=spec.get("args", []),
                env=spec.get("env"),
            )
    
    return servers
