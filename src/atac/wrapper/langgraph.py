"""LangGraph decorator wrapper for ATaC."""

from __future__ import annotations

import asyncio
import inspect
from collections.abc import Callable
from typing import Any

from langchain_core.tools import BaseTool
from langchain_core.tools import tool as langgraph_tool

from atac import get_service
from atac.service import AtacService

try:
    from langchain_mcp_adapters.client import (
        MultiServerMCPClient as _OfficialMultiServerMCPClient,
    )
except ImportError:
    _OfficialMultiServerMCPClient = None


if _OfficialMultiServerMCPClient is None:

    class MultiServerMCPClient:
        """Fallback placeholder when langchain_mcp_adapters is unavailable."""

        def __init__(self, *_args: Any, **_kwargs: Any) -> None:
            raise ImportError(
                "langchain_mcp_adapters is required for MultiServerMCPClient. "
                "Install it to use MCP registration."
            )

else:

    class MultiServerMCPClient(_OfficialMultiServerMCPClient):
        """ATaC MCP client that can auto-register discovered tools on init."""

        def __init__(
            self,
            servers: dict[str, dict[str, Any]],
            *,
            prefix: str | None = None,
            include: set[str] | None = None,
            exclude: set[str] | None = None,
            name_mapper: Callable[[str], str] | None = None,
            auto_register: bool = True,
            **kwargs: Any,
        ) -> None:
            super().__init__(servers, **kwargs)
            self._default_prefix = prefix
            self._default_include = include or set()
            self._default_exclude = exclude or set()
            self._default_name_mapper = name_mapper
            if auto_register:
                self.register_to_atac(
                    prefix=prefix,
                    include=include,
                    exclude=exclude,
                    name_mapper=name_mapper,
                )

        async def register_to_atac_async(
            self,
            *,
            prefix: str | None = None,
            include: set[str] | None = None,
            exclude: set[str] | None = None,
            name_mapper: Callable[[str], str] | None = None,
        ) -> list[str]:
            service = _require_global_service()
            include_set = self._default_include if include is None else include
            exclude_set = self._default_exclude if exclude is None else exclude
            resolved_prefix = self._default_prefix if prefix is None else prefix
            resolved_mapper = (
                self._default_name_mapper if name_mapper is None else name_mapper
            )

            discovered_tools = await _get_mcp_tools(self)

            registered_names: list[str] = []
            for discovered_tool in discovered_tools:
                discovered_name = _resolve_tool_name(discovered_tool)
                if include_set and discovered_name not in include_set:
                    continue
                if discovered_name in exclude_set:
                    continue
                register_name = _build_register_name(
                    raw_name=discovered_name,
                    prefix=resolved_prefix,
                    name_mapper=resolved_mapper,
                )
                service.register_langgraph_tool(register_name, discovered_tool)
                registered_names.append(register_name)
            return registered_names

        def register_to_atac(
            self,
            *,
            prefix: str | None = None,
            include: set[str] | None = None,
            exclude: set[str] | None = None,
            name_mapper: Callable[[str], str] | None = None,
        ) -> list[str]:
            return _run_awaitable(
                self.register_to_atac_async(
                    prefix=prefix,
                    include=include,
                    exclude=exclude,
                    name_mapper=name_mapper,
                )
            )


def tool(
    *,
    name: str | None = None,
    register_name: str | None = None,
    **kwargs: Any,
) -> Callable[[Callable[..., Any]], BaseTool]:
    """
    Decorate a function as a real LangGraph tool and auto-register it to ATaC.

    Function metadata (name, description, args schema) is preserved by returning
    the LangGraph tool instance directly.
    """
    def decorator(func: Callable[..., Any]) -> BaseTool:
        service = _require_global_service()
        tool_name = name or func.__name__
        wrapped_tool = langgraph_tool(tool_name, **kwargs)(func)
        service.register_langgraph_tool(register_name or wrapped_tool.name, wrapped_tool)
        return wrapped_tool

    return decorator


async def _get_mcp_tools(client: Any) -> list[Any]:
    get_tools = getattr(client, "get_tools", None)
    if not callable(get_tools):
        raise TypeError("MCP client must expose a callable 'get_tools' method")
    maybe_tools = get_tools()
    if inspect.isawaitable(maybe_tools):
        maybe_tools = await maybe_tools
    return list(maybe_tools)


def _resolve_tool_name(tool_obj: Any) -> str:
    tool_name = getattr(tool_obj, "name", None)
    if not isinstance(tool_name, str) or not tool_name.strip():
        raise ValueError("Each MCP tool must expose a non-empty 'name' attribute")
    return tool_name


def _build_register_name(
    *,
    raw_name: str,
    prefix: str | None,
    name_mapper: Callable[[str], str] | None,
) -> str:
    mapped = name_mapper(raw_name) if name_mapper else raw_name
    if not isinstance(mapped, str) or not mapped.strip():
        raise ValueError("Mapped tool name must be a non-empty string")
    if prefix:
        return f"{prefix}.{mapped}"
    return mapped


def _require_global_service() -> AtacService:
    service = get_service()
    if service is None:
        raise RuntimeError(
            "ATaC global service is not set. "
            "Call atac.set_service(service) before using wrapper.langgraph helpers."
        )
    return service


def _run_awaitable(awaitable: Any) -> Any:
    if not inspect.isawaitable(awaitable):
        return awaitable
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(awaitable)
    if loop.is_running():
        raise RuntimeError(
            "Synchronous registration cannot run inside an active event loop; "
            "use 'await client.register_to_atac_async(...)' instead"
        )
    return asyncio.run(awaitable)
