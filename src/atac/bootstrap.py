"""Bootstrap loader for ATaC service startup."""

from __future__ import annotations

import importlib

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

    module = importlib.import_module(module_name)
    factory = getattr(module, callable_name, None)
    if factory is None:
        raise AttributeError(f"Callable '{callable_name}' not found in module '{module_name}'")
    if not callable(factory):
        raise TypeError(f"Bootstrap target '{spec}' is not callable")

    service = factory()
    if not isinstance(service, AtacService):
        raise TypeError("Bootstrap callable must return AtacService")
    return service

