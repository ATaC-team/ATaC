import importlib
from typing import Any

from atac.runtimes.v1.executors.base import ActionExecutor
from atac.runtimes.v1.models import ParsedAction


class KimiExecutor(ActionExecutor):
    """Executor for Kimi-CLI built-in tools (kimi:// scheme)."""

    def __init__(self):
        self._tools = {}
        self._mock_config = None
        self._mock_runtime = None

    def _ensure_initialized(self):
        if self._mock_config:
            return
            
        try:
            importlib.import_module("kimi_cli")
        except ImportError:
            raise ImportError(
                "kimi-cli not found. To use the KimiExecutor, please install ATaC with the '[kimi]' extra: "
                "pip install 'atac[kimi]' or 'uv pip install atac[kimi]'"
            )
            
        from dataclasses import dataclass, field

        from kaos.path import KaosPath
        from pydantic import BaseModel
        
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
            "shell/bash": ("kimi_cli.tools.shell", "Shell"),
        }

        path = f"{action.server_or_cmd}/{action.method}".strip("/")
        if path not in tool_map:
            raise ValueError(f"Unknown Kimi tool: {path}")

        module_name, class_name = tool_map[path]
        
        if path not in self._tools:
            import importlib
            module = importlib.import_module(module_name)
            tool_cls = getattr(module, class_name)
            
            import inspect
            sig = inspect.signature(tool_cls)
            init_args = {}
            if "config" in sig.parameters:
                init_args["config"] = self._mock_config
            if "runtime" in sig.parameters:
                init_args["runtime"] = self._mock_runtime
                
            self._tools[path] = tool_cls(**init_args)

        tool = self._tools[path]
        
        if hasattr(tool, "params"):
            params = tool.params.model_validate(args)
            result = await tool(params)
        else:
            result = await tool(**args)

        if result.is_error:
            raise RuntimeError(f"Kimi tool error: {result.message}")
            
        return result.output
