"""LangGraph loading and execution helpers for ATaC."""

from __future__ import annotations

import importlib
import inspect
from contextlib import contextmanager
from typing import Any

from atac import get_service, set_service
from atac.service import AtacService


def load_graph_from_spec(spec: str, service: AtacService) -> Any:
    """Load a graph app from ``<module_path>:<name>`` after binding the service."""
    if ":" not in spec:
        raise ValueError("Graph spec must use '<module_path>:<name>' format")

    module_name, attr_name = spec.split(":", maxsplit=1)
    if not module_name or not attr_name:
        raise ValueError("Graph spec must include both module path and attribute name")

    with _bound_service(service):
        module = importlib.import_module(module_name)
        target = getattr(module, attr_name, None)
        if target is None:
            raise AttributeError(f"Attribute '{attr_name}' not found in module '{module_name}'")

        if callable(target):
            signature = inspect.signature(target)
            required_params = [
                param
                for param in signature.parameters.values()
                if param.default is inspect._empty
                and param.kind
                in (
                    inspect.Parameter.POSITIONAL_ONLY,
                    inspect.Parameter.POSITIONAL_OR_KEYWORD,
                    inspect.Parameter.KEYWORD_ONLY,
                )
            ]
            if required_params:
                raise TypeError(
                    "Graph factory must be zero-argument when loaded from CLI; "
                    "bind dependencies like models in a wrapper function first"
                )
            app = target()
        else:
            app = target
    if not _is_graph_app(app):
        raise TypeError("Graph target must be a compiled graph or expose invoke/ainvoke")
    return _BoundGraphApp(app, service)


def invoke_graph(app: Any, state: dict[str, Any]) -> Any:
    """Invoke a compiled graph synchronously."""
    ainvoke = getattr(app, "ainvoke", None)
    if callable(ainvoke):
        return _run_awaitable(ainvoke(state))

    invoke = getattr(app, "invoke", None)
    if callable(invoke):
        return invoke(state)

    raise TypeError("Graph app must expose invoke/ainvoke")


async def ainvoke_graph(app: Any, state: dict[str, Any]) -> Any:
    """Invoke a compiled graph asynchronously."""
    ainvoke = getattr(app, "ainvoke", None)
    if callable(ainvoke):
        return await ainvoke(state)

    invoke = getattr(app, "invoke", None)
    if callable(invoke):
        result = invoke(state)
        if inspect.isawaitable(result):
            return await result
        return result

    raise TypeError("Graph app must expose invoke/ainvoke")


def _is_graph_app(app: Any) -> bool:
    return callable(getattr(app, "invoke", None)) or callable(getattr(app, "ainvoke", None))


class _BoundGraphApp:
    """Graph app wrapper that binds the ATaC service only for each invocation."""

    def __init__(self, app: Any, service: AtacService) -> None:
        self._app = app
        self._service = service

    def invoke(self, state: dict[str, Any]) -> Any:
        invoke = getattr(self._app, "invoke", None)
        if not callable(invoke):
            raise TypeError("Graph app must expose invoke/ainvoke")
        with _bound_service(self._service):
            return invoke(state)

    async def ainvoke(self, state: dict[str, Any]) -> Any:
        ainvoke = getattr(self._app, "ainvoke", None)
        if callable(ainvoke):
            with _bound_service(self._service):
                return await ainvoke(state)

        invoke = getattr(self._app, "invoke", None)
        if not callable(invoke):
            raise TypeError("Graph app must expose invoke/ainvoke")
        with _bound_service(self._service):
            result = invoke(state)
        if inspect.isawaitable(result):
            return await result
        return result


@contextmanager
def _bound_service(service: AtacService):
    previous = get_service()
    set_service(service)
    try:
        yield
    finally:
        set_service(previous)


def _run_awaitable(awaitable: Any) -> Any:
    if not inspect.isawaitable(awaitable):
        return awaitable
    try:
        import asyncio

        loop = asyncio.get_running_loop()
    except RuntimeError:
        import asyncio

        return asyncio.run(awaitable)
    if loop.is_running():
        raise RuntimeError("Cannot invoke async graph while an event loop is already running")
    import asyncio

    return asyncio.run(awaitable)
