"""Tool registry used by ATaC runtime."""

from __future__ import annotations

from atac.tools.types import ToolWrapper


class ToolRegistry:
    """In-memory registry of tool name to wrapper bindings."""

    def __init__(self) -> None:
        self._bindings: dict[str, ToolWrapper] = {}

    def register(self, name: str, wrapper: ToolWrapper) -> None:
        if not name or not name.strip():
            raise ValueError("Tool name must be a non-empty string")
        self._bindings[name] = wrapper

    def resolve(self, name: str) -> ToolWrapper:
        try:
            return self._bindings[name]
        except KeyError as exc:
            raise KeyError(f"Tool '{name}' is not registered") from exc

    def has(self, name: str) -> bool:
        return name in self._bindings

    def list_names(self) -> list[str]:
        return sorted(self._bindings.keys())

