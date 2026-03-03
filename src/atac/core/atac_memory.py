"""
ATaC Memory — lightweight agent memory store.

Memory records are stored as bundles under .atac/.memory/<name>/index.html.
The index.html entry embeds the structured memory payload and the bundle may
also include helper scripts or other local assets.
"""

from __future__ import annotations

import json
import shutil
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

import yaml


class _MemoryHTMLParser(HTMLParser):
    """Extract embedded memory JSON from the generated HTML bundle entry."""

    def __init__(self) -> None:
        super().__init__()
        self._capture = False
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = dict(attrs)
        if (
            tag == "script"
            and attr_map.get("id") == "atac-memory-data"
            and attr_map.get("type") == "application/json"
        ):
            self._capture = True

    def handle_data(self, data: str) -> None:
        if self._capture:
            self._parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._capture:
            self._capture = False

    @property
    def payload(self) -> str:
        return "".join(self._parts).strip()


class ATaCMemory:
    """CRUD interface for ATaC Memory records."""

    BASE_DIR = Path(".atac/.memory")
    ENTRY_FILE = "index.html"
    DATA_SCRIPT_ID = "atac-memory-data"
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
        """Return the bundle directory path for a given memory name."""
        return cls.BASE_DIR / name

    @classmethod
    def resolve_entry_path(cls, name: str) -> Path:
        """Return the bundle entry path for a given memory name."""
        return cls.resolve_path(name) / cls.ENTRY_FILE

    @classmethod
    def resolve_legacy_path(cls, name: str) -> Path:
        """Return the legacy YAML path for a given memory name."""
        return cls.BASE_DIR / f"{name}.yaml"

    # ------------------------------------------------------------------ helpers

    @classmethod
    def _extract_from_html(cls, html_text: str, source: Path) -> dict[str, Any]:
        parser = _MemoryHTMLParser()
        parser.feed(html_text)
        payload = parser.payload
        if not payload:
            raise ValueError(
                f"Memory bundle '{source}' is missing embedded JSON in #{cls.DATA_SCRIPT_ID}"
            )

        try:
            data = json.loads(payload)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"Memory bundle '{source}' contains invalid embedded JSON: {exc}"
            ) from exc

        if not isinstance(data, dict):
            raise ValueError(f"Memory bundle '{source}' must embed a JSON object")
        return data

    @classmethod
    def _load_bundle(cls, bundle_dir: Path) -> dict[str, Any]:
        entry_path = bundle_dir / cls.ENTRY_FILE
        if not entry_path.exists():
            raise FileNotFoundError(
                f"Memory bundle '{bundle_dir.name}' not found at {entry_path}"
            )
        data = cls._extract_from_html(entry_path.read_text(encoding="utf-8"), entry_path)
        cls.validate(data)
        return data

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

    @classmethod
    def _render_html(cls, data: dict[str, Any]) -> str:
        json_payload = json.dumps(data, ensure_ascii=False, indent=2).replace("</", "<\\/")
        tags = ", ".join(data.get("tags", [])) or "untagged"

        step_items = []
        for step in data["steps"]:
            heading = ""
            if step.get("tool"):
                heading = f"<strong>Tool:</strong> {escape(step['tool'])}"
            note = ""
            if step.get("note"):
                note = f"<p>{escape(step['note'])}</p>"
            args = ""
            if step.get("args"):
                args_json = escape(json.dumps(step["args"], ensure_ascii=False, indent=2))
                args = f"<pre><code>{args_json}</code></pre>"
            if not heading:
                heading = "<strong>Note</strong>"
            step_items.append(f"<li>{heading}{note}{args}</li>")

        steps_html = "\n".join(step_items)
        title = escape(data["name"])
        description = escape(data["description"])
        tag_block = escape(tags)

        return f"""<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content="{description}" />
    <style>
      :root {{
        color-scheme: light;
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif;
        line-height: 1.6;
      }}
      body {{
        margin: 0;
        background: linear-gradient(180deg, #f7f1e3 0%, #fffaf0 100%);
        color: #261c15;
      }}
      main {{
        max-width: 760px;
        margin: 0 auto;
        padding: 48px 24px 72px;
      }}
      h1 {{
        margin-bottom: 0.25rem;
        font-size: clamp(2rem, 4vw, 3rem);
      }}
      .meta {{
        color: #6a5444;
        font-size: 0.95rem;
      }}
      article {{
        background: rgba(255, 255, 255, 0.8);
        border: 1px solid rgba(74, 50, 31, 0.12);
        border-radius: 20px;
        padding: 24px;
        box-shadow: 0 18px 60px rgba(74, 50, 31, 0.08);
      }}
      ol {{
        padding-left: 1.25rem;
      }}
      li + li {{
        margin-top: 1rem;
      }}
      pre {{
        overflow-x: auto;
        padding: 12px;
        background: #f3ead7;
        border-radius: 12px;
      }}
    </style>
  </head>
  <body>
    <main>
      <article>
        <h1>{title}</h1>
        <p>{description}</p>
        <p class="meta">Tags: {tag_block}</p>
        <h2>Guidance</h2>
        <ol>
          {steps_html}
        </ol>
      </article>
    </main>
    <script id="{cls.DATA_SCRIPT_ID}" type="application/json">
{json_payload}
    </script>
  </body>
</html>
"""

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
        entry_path.write_text(cls._render_html(data), encoding="utf-8")
        return bundle_dir

    @classmethod
    def save_bundle(cls, source_dir: str | Path) -> Path:
        """
        Validate and copy an existing memory bundle directory into .atac/.memory/.

        Args:
            source_dir: Directory containing an index.html memory entry and optional assets.

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
            with open(legacy_path, encoding="utf-8") as f:
                data = yaml.safe_load(f)
            cls.validate(data)
            return data

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
                    data = cls._load_bundle(path)
                elif path.suffix == ".yaml":
                    data = yaml.safe_load(path.read_text(encoding="utf-8"))
                    cls.validate(data)
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
    def search(cls, query: str) -> list[dict[str, Any]]:
        """
        Search memory records by keywords across name, description, and tags.
        Each word in the query must match at least one of the fields.

        Args:
            query: Search string with one or more space-separated keywords.

        Returns:
            List of matching summary dicts.
        """
        keywords = [k.lower() for k in query.split() if k]
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
