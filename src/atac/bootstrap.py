"""Bootstrap loader for ATaC service startup."""

from __future__ import annotations

import asyncio
import importlib
import inspect

from atac.service import AtacService


def load_service_from_bootstrap(spec: str) -> AtacService:
    """
    Load AtacService from `<module_path>:<callable_name>`.
    """
    if ":" not in spec:
        raise ValueError("Bootstrap must use '<module_path>:<callable_name>' format")

    module_name, callable_name = spec.split(":", maxsplit=1)
    if not module_name or not callable_name:
        raise ValueError("Bootstrap must include both module path and callable name")

    factory = _load_bootstrap_factory(module_name, callable_name, spec)
    service = factory()
    if inspect.isawaitable(service):
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            service = asyncio.run(service)
        else:
            raise RuntimeError(
                "Async bootstrap cannot be loaded through load_service_from_bootstrap() "
                "inside an active event loop; use aload_service_from_bootstrap() instead"
            )
    return _validate_service(service)


async def aload_service_from_bootstrap(spec: str) -> AtacService:
    """Load AtacService from `<module_path>:<callable_name>`, awaiting async callables."""
    if ":" not in spec:
        raise ValueError("Bootstrap must use '<module_path>:<callable_name>' format")

    module_name, callable_name = spec.split(":", maxsplit=1)
    if not module_name or not callable_name:
        raise ValueError("Bootstrap must include both module path and callable name")

    factory = _load_bootstrap_factory(module_name, callable_name, spec)
    service = factory()
    if inspect.isawaitable(service):
        service = await service
    return _validate_service(service)


def _load_bootstrap_factory(module_name: str, callable_name: str, spec: str):
    module = importlib.import_module(module_name)
    factory = getattr(module, callable_name, None)
    if factory is None:
        raise AttributeError(f"Callable '{callable_name}' not found in module '{module_name}'")
    if not callable(factory):
        raise TypeError(f"Bootstrap target '{spec}' is not callable")
    return factory


def _validate_service(service: object) -> AtacService:
    if not isinstance(service, AtacService):
        raise TypeError("Bootstrap callable must return AtacService")
    return service
