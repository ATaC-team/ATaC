"""
ATaC Memory — lightweight agent memory store.

Memory records are stored as bundles under .atac/.memory/<name>/index.yaml.
The bundle may also include helper scripts or other local assets.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

import yaml


class ATaCMemory:
    """CRUD interface for ATaC Memory records."""

    BASE_DIR = Path(".atac/.memory")
    ENTRY_FILE = "index.yaml"
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

    @classmethod
    def set_base_dir(cls, path: str | Path) -> None:
        """Override the memory storage root for the current process."""
        cls.BASE_DIR = Path(path)

    # ------------------------------------------------------------------ paths

    @classmethod
    def resolve_path(cls, name: str) -> Path:
        """Return the bundle directory path for a given memory name."""
        return cls.BASE_DIR / name

    @classmethod
    def resolve_entry_path(cls, name: str) -> Path:
        """Return the bundle entry path for a given memory name."""
        return cls.resolve_path(name) / cls.ENTRY_FILE

    @classmethod
    def resolve_legacy_path(cls, name: str) -> Path:
        """Return the legacy single-file YAML path for a given memory name."""
        return cls.BASE_DIR / f"{name}.yaml"

    # ------------------------------------------------------------------ helpers

    @classmethod
    def _load_yaml_file(cls, path: Path) -> dict[str, Any]:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError(f"Memory file '{path}' must contain a YAML object")
        cls.validate(data)
        return data

    @classmethod
    def _load_bundle(cls, bundle_dir: Path) -> dict[str, Any]:
        entry_path = bundle_dir / cls.ENTRY_FILE
        if not entry_path.exists():
            raise FileNotFoundError(
                f"Memory bundle '{bundle_dir.name}' not found at {entry_path}"
            )
        return cls._load_yaml_file(entry_path)

    @classmethod
    def _summary(cls, data: dict[str, Any]) -> dict[str, Any]:
        return {
            "name": data.get("name", ""),
            "description": data.get("description", ""),
            "tags": data.get("tags", []),
        }

    @classmethod
    def _clear_existing(cls, name: str) -> None:
        bundle_dir = cls.resolve_path(name)
        legacy_path = cls.resolve_legacy_path(name)

        if bundle_dir.exists():
            shutil.rmtree(bundle_dir)
        if legacy_path.exists():
            legacy_path.unlink()

    # ------------------------------------------------------------------ CRUD

    @classmethod
    def save(cls, data: dict[str, Any]) -> Path:
        """
        Validate and persist a memory record as a bundle directory.

        Args:
            data: Memory dict (must conform to the memory schema).

        Returns:
            Bundle directory where the memory was written.
        """
        cls.validate(data)
        cls.BASE_DIR.mkdir(parents=True, exist_ok=True)
        bundle_dir = cls.resolve_path(data["name"])
        cls._clear_existing(data["name"])
        bundle_dir.mkdir(parents=True, exist_ok=True)
        entry_path = bundle_dir / cls.ENTRY_FILE
        entry_path.write_text(
            yaml.safe_dump(data, allow_unicode=True, sort_keys=False),
            encoding="utf-8",
        )
        return bundle_dir

    @classmethod
    def save_bundle(cls, source_dir: str | Path) -> Path:
        """
        Validate and copy an existing memory bundle directory into .atac/.memory/.

        Args:
            source_dir: Directory containing an index.yaml memory entry and optional assets.

        Returns:
            Bundle directory where the memory was written.
        """
        source = Path(source_dir)
        if not source.is_dir():
            raise FileNotFoundError(f"Memory bundle source directory not found: {source}")

        data = cls._load_bundle(source)
        destination = cls.resolve_path(data["name"])
        cls.BASE_DIR.mkdir(parents=True, exist_ok=True)

        if source.resolve() == destination.resolve():
            return destination

        cls._clear_existing(data["name"])
        shutil.copytree(source, destination)
        return destination

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
        bundle_dir = cls.resolve_path(name)
        if bundle_dir.is_dir():
            return cls._load_bundle(bundle_dir)

        legacy_path = cls.resolve_legacy_path(name)
        if legacy_path.exists():
            return cls._load_yaml_file(legacy_path)

        raise FileNotFoundError(
            f"Memory '{name}' not found at {cls.resolve_entry_path(name)}"
        )

    @classmethod
    def list_all(cls) -> list[dict[str, Any]]:
        """
        Scan .atac/.memory/ and return summary dicts for all valid records.

        Returns:
            List of dicts with keys: name, description, tags.
        """
        if not cls.BASE_DIR.exists():
            return []

        records: list[dict[str, Any]] = []
        seen_names: set[str] = set()

        for path in sorted(cls.BASE_DIR.iterdir(), key=lambda item: item.name):
            try:
                if path.is_dir():
                    entry_path = path / cls.ENTRY_FILE
                    if not entry_path.exists():
                        continue
                    data = cls._load_yaml_file(entry_path)
                elif path.suffix == ".yaml":
                    data = cls._load_yaml_file(path)
                else:
                    continue

                name = data.get("name", path.stem)
                if name in seen_names:
                    continue
                seen_names.add(name)
                records.append(cls._summary(data))
            except Exception:
                continue

        return records

    @classmethod
    def delete(cls, name: str) -> None:
        """
        Delete a memory record by name.

        Raises:
            FileNotFoundError: if the memory does not exist.
        """
        bundle_dir = cls.resolve_path(name)
        if bundle_dir.exists():
            shutil.rmtree(bundle_dir)
            return

        legacy_path = cls.resolve_legacy_path(name)
        if legacy_path.exists():
            legacy_path.unlink()
            return

        raise FileNotFoundError(
            f"Memory '{name}' not found at {cls.resolve_entry_path(name)}"
        )

    # ------------------------------------------------------------------ search

    @classmethod
    def search(cls, query: str | list[str]) -> list[dict[str, Any]]:
        """
        Search memory records by keywords across name, description, and tags.
        Each keyword must match at least one of the fields.

        Args:
            query: Either a search string with space-separated keywords or an
                explicit list of search terms.

        Returns:
            List of matching summary dicts.
        """
        if isinstance(query, str):
            keywords = [k.lower() for k in query.split() if k]
        else:
            keywords = [term.strip().lower() for term in query if term.strip()]

        if not keywords:
            return cls.list_all()

        results = []
        for record in cls.list_all():
            name = record.get("name", "").lower()
            desc = record.get("description", "").lower()
            tags = [t.lower() for t in record.get("tags", [])]

            if all(kw in name or kw in desc or any(kw in t for t in tags) for kw in keywords):
                results.append(record)

        return results
