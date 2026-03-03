"""
ATaC Memory — lightweight agent memory store.

Memory records are YAML files stored at .atac/memory/<name>.yaml.
They capture reusable task patterns with optional tool hints for agents.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml


class ATaCMemory:
    """CRUD interface for ATaC Memory records."""

    BASE_DIR = Path(".atac/memory")
    _schema_cache: dict | None = None

    # ------------------------------------------------------------------ schema

    @classmethod
    def _schema(cls) -> dict:
        if cls._schema_cache is None:
            schema_path = Path(__file__).parent.parent / "specs" / "memory" / "schema.json"
            with open(schema_path, encoding="utf-8") as f:
                cls._schema_cache = json.load(f)
        return cls._schema_cache

    @classmethod
    def validate(cls, data: dict[str, Any]) -> None:
        """Validate a memory dict against the JSON Schema. Raises jsonschema.ValidationError on failure."""
        import jsonschema

        jsonschema.validate(instance=data, schema=cls._schema())

    # ------------------------------------------------------------------ paths

    @classmethod
    def resolve_path(cls, name: str) -> Path:
        """Return the YAML path for a given memory name."""
        return cls.BASE_DIR / f"{name}.yaml"

    # ------------------------------------------------------------------ CRUD

    @classmethod
    def save(cls, data: dict[str, Any]) -> Path:
        """
        Validate and persist a memory record.

        Args:
            data: Memory dict (must conform to the memory schema).

        Returns:
            Path where the file was written.
        """
        cls.validate(data)
        cls.BASE_DIR.mkdir(parents=True, exist_ok=True)
        path = cls.resolve_path(data["name"])
        with open(path, "w", encoding="utf-8") as f:
            yaml.dump(data, f, allow_unicode=True, sort_keys=False)
        return path

    @classmethod
    def load(cls, name: str) -> dict[str, Any]:
        """
        Load a memory record by name.

        Args:
            name: The slug name of the memory.

        Returns:
            Parsed memory dict.

        Raises:
            FileNotFoundError: if the memory does not exist.
        """
        path = cls.resolve_path(name)
        if not path.exists():
            raise FileNotFoundError(f"Memory '{name}' not found at {path}")
        with open(path, encoding="utf-8") as f:
            return yaml.safe_load(f)

    @classmethod
    def list_all(cls) -> list[dict[str, Any]]:
        """
        Scan .atac/memory/ and return summary dicts for all valid records.

        Returns:
            List of dicts with keys: name, description, tags.
        """
        if not cls.BASE_DIR.exists():
            return []

        records = []
        for p in sorted(cls.BASE_DIR.glob("*.yaml")):
            try:
                data = yaml.safe_load(p.read_text(encoding="utf-8"))
                records.append(
                    {
                        "name": data.get("name", p.stem),
                        "description": data.get("description", ""),
                        "tags": data.get("tags", []),
                    }
                )
            except Exception:
                continue  # skip malformed files
        return records

    @classmethod
    def delete(cls, name: str) -> None:
        """
        Delete a memory record by name.

        Raises:
            FileNotFoundError: if the memory does not exist.
        """
        path = cls.resolve_path(name)
        if not path.exists():
            raise FileNotFoundError(f"Memory '{name}' not found at {path}")
        path.unlink()

    # ------------------------------------------------------------------ search

    @classmethod
    def search(cls, query: str) -> list[dict[str, Any]]:
        """
        Case-insensitive keyword search across name, description, and tags.

        Args:
            query: Search string.

        Returns:
            List of matching summary dicts.
        """
        q = query.lower()
        results = []
        for record in cls.list_all():
            haystack = " ".join(
                [
                    record.get("name", ""),
                    record.get("description", ""),
                    " ".join(record.get("tags", [])),
                ]
            ).lower()
            if q in haystack:
                results.append(record)
        return results
