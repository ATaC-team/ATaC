import importlib.util
import os
import sys
from pathlib import Path
from typing import Any, Optional

from atac.runtimes.v1.executors.base import ActionExecutor
from atac.runtimes.v1.models import ParsedAction

class KimiExecutor(ActionExecutor):
    """Executor for Kimi-CLI built-in tools (kimi:// scheme)."""

    def __init__(self, kimi_cli_path: Optional[str | Path] = None):
        if kimi_cli_path:
            self._kimi_cli_path = Path(kimi_cli_path)
        else:
            self._kimi_cli_path = self._discover_kimi_cli()
        self._initialized = False
        self._tools = {}

    def _discover_kimi_cli(self) -> Optional[Path]:
        """Attempt to find the site-packages directory of kimi-cli."""
        # 1. Check PYTHONPATH
        if importlib.util.find_spec("kimi_cli"):
            return None # Already in path
            
        # 2. Check common uv tool locations on macOS
        uv_tool_path = Path.home() / ".local/share/uv/tools/kimi-cli"
        if uv_tool_path.exists():
            # Try to find site-packages
            lib_path = uv_tool_path / "lib"
            if lib_path.exists():
                # find first subdir in lib (usually python3.x)
                py_dirs = list(lib_path.glob("python3.*"))
                if py_dirs:
                    site_pkgs = py_dirs[0] / "site-packages"
                    if site_pkgs.exists():
                        return site_pkgs
        return None

    def _ensure_initialized(self):
        if self._initialized:
            return
            
        if self._kimi_cli_path:
            sys.path.append(str(self._kimi_cli_path))
            
        try:
            import kimi_cli
            import kosong
        except ImportError:
            raise ImportError(
                "kimi-cli or kosong not found. Please install kimi-cli first. "
                "Recommendation: uv tool install --python 3.13 kimi-cli"
            )
            
        self._setup_mocks()
        self._initialized = True

    def _setup_mocks(self):
        """Setup mock Runtime and Config for Kimi tools."""
        from pydantic import BaseModel
        from kaos.path import KaosPath
        from dataclasses import dataclass, field

        class MockConfig(BaseModel):
            class Services(BaseModel):
                moonshot_search: Any = None
                moonshot_fetch: Any = None
            services: Services = Services()

        @dataclass
        class MockBuiltinArgs:
            KIMI_NOW: str = ""
            KIMI_WORK_DIR: KaosPath = field(default_factory=KaosPath.cwd)
            KIMI_WORK_DIR_LS: str = ""
            KIMI_AGENTS_MD: str = ""
            KIMI_SKILLS: str = ""

        class MockRuntime:
            def __init__(self, builtin_args):
                self.builtin_args = builtin_args
                self.config = MockConfig()

        self._mock_config = MockConfig()
        self._mock_runtime = MockRuntime(MockBuiltinArgs())

    async def execute(self, action: ParsedAction, args: dict[str, Any]) -> Any:
        self._ensure_initialized()
        
        tool_map = {
            "web/fetch": ("kimi_cli.tools.web.fetch", "FetchURL"),
            "file/read": ("kimi_cli.tools.file.read", "ReadFile"),
            "file/write": ("kimi_cli.tools.file.write", "WriteFile"),
            "file/replace": ("kimi_cli.tools.file.replace", "Replace"),
            "file/glob": ("kimi_cli.tools.file.glob", "Glob"),
            "file/grep": ("kimi_cli.tools.file.grep_local", "Grep"),
            "shell/bash": ("kimi_cli.tools.shell", "Shell"), # Not ideal, but for completeness
        }

        path = f"{action.server_or_cmd}/{action.method}".strip("/")
        if path not in tool_map:
            raise ValueError(f"Unknown Kimi tool: {path}")

        module_name, class_name = tool_map[path]
        
        # Cache tool instances
        if path not in self._tools:
            module = importlib.import_module(module_name)
            tool_cls = getattr(module, class_name)
            
            # Instantiate tool
            # Most kimi tools take 'config' and 'runtime' or just 'runtime'
            import inspect
            sig = inspect.signature(tool_cls)
            init_args = {}
            if "config" in sig.parameters:
                init_args["config"] = self._mock_config
            if "runtime" in sig.parameters:
                init_args["runtime"] = self._mock_runtime
                
            self._tools[path] = tool_cls(**init_args)

        tool = self._tools[path]
        
        # Prepare params
        if hasattr(tool, "params"):
            params = tool.params.model_validate(args)
            result = await tool(params)
        else:
            # For tools using CallableTool instead of CallableTool2
            result = await tool(**args)

        if result.is_error:
            raise RuntimeError(f"Kimi tool error: {result.message}")
            
        return result.output
