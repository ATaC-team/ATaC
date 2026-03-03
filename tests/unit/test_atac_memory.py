"""Unit tests for ATaCMemory core class."""


import pytest
import yaml

from atac.core.atac_memory import ATaCMemory

# ------------------------------------------------------------------ fixtures

VALID_MEMORY = {
    "name": "test_query",
    "description": "A test memory record",
    "tags": ["test", "example"],
    "steps": [
        {"note": "First observe the data"},
        {
            "tool": "execute_query",
            "note": "Run query with filters",
            "args": {"entity_name": "sections"},
        },
        {"tool": "discover_entities"},
    ],
}


def _write_bundle(bundle_dir, data, script_name=None):
    bundle_dir.mkdir(parents=True, exist_ok=True)
    entry_path = bundle_dir / ATaCMemory.ENTRY_FILE
    entry_path.write_text(
        yaml.safe_dump(data, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )
    if script_name:
        script_path = bundle_dir / script_name
        script_path.parent.mkdir(parents=True, exist_ok=True)
        script_path.write_text("echo memory\n", encoding="utf-8")


@pytest.fixture(autouse=True)
def tmp_memory_dir(tmp_path, monkeypatch):
    """Redirect .atac/.memory to a temp directory for each test."""
    mem_dir = tmp_path / ".atac" / ".memory"
    mem_dir.mkdir(parents=True)
    monkeypatch.setattr(ATaCMemory, "BASE_DIR", mem_dir)
    return mem_dir


# ------------------------------------------------------------------ validate


def test_validate_valid():
    ATaCMemory.validate(VALID_MEMORY)


def test_validate_missing_name():
    import jsonschema

    data = {**VALID_MEMORY}
    del data["name"]
    with pytest.raises(jsonschema.ValidationError):
        ATaCMemory.validate(data)


def test_validate_missing_description():
    import jsonschema

    data = {**VALID_MEMORY, "description": ""}
    with pytest.raises(jsonschema.ValidationError):
        ATaCMemory.validate(data)


def test_validate_invalid_name_format():
    import jsonschema

    data = {**VALID_MEMORY, "name": "Invalid Name With Spaces"}
    with pytest.raises(jsonschema.ValidationError):
        ATaCMemory.validate(data)


def test_validate_empty_steps():
    import jsonschema

    data = {**VALID_MEMORY, "steps": []}
    with pytest.raises(jsonschema.ValidationError):
        ATaCMemory.validate(data)


def test_validate_step_missing_note_and_tool():
    import jsonschema

    data = {**VALID_MEMORY, "steps": [{"args": {"foo": "bar"}}]}
    with pytest.raises(jsonschema.ValidationError):
        ATaCMemory.validate(data)


def test_validate_step_note_only():
    data = {**VALID_MEMORY, "steps": [{"note": "just a note"}]}
    ATaCMemory.validate(data)


def test_validate_step_tool_only():
    data = {**VALID_MEMORY, "steps": [{"tool": "some_tool"}]}
    ATaCMemory.validate(data)


# ------------------------------------------------------------------ save / load


def test_save_creates_bundle(tmp_memory_dir):
    path = ATaCMemory.save(VALID_MEMORY)
    assert path.is_dir()
    entry_path = path / ATaCMemory.ENTRY_FILE
    assert entry_path.exists()
    content = yaml.safe_load(entry_path.read_text(encoding="utf-8"))
    assert content["name"] == "test_query"


def test_save_bundle_copies_scripts(tmp_path, tmp_memory_dir):
    source_dir = tmp_path / "source_bundle"
    _write_bundle(source_dir, VALID_MEMORY, script_name="scripts/analyze.sh")

    path = ATaCMemory.save_bundle(source_dir)

    assert path == ATaCMemory.resolve_path("test_query")
    assert (path / "scripts" / "analyze.sh").exists()
    assert ATaCMemory.load("test_query")["name"] == "test_query"


def test_load_returns_dict(tmp_memory_dir):
    ATaCMemory.save(VALID_MEMORY)
    data = ATaCMemory.load("test_query")
    assert data["name"] == "test_query"
    assert data["description"] == VALID_MEMORY["description"]


def test_load_legacy_yaml_returns_dict(tmp_memory_dir):
    legacy_path = ATaCMemory.resolve_legacy_path("test_query")
    legacy_path.write_text(yaml.safe_dump(VALID_MEMORY, sort_keys=False), encoding="utf-8")

    data = ATaCMemory.load("test_query")
    assert data["name"] == "test_query"


def test_load_not_found(tmp_memory_dir):
    with pytest.raises(FileNotFoundError):
        ATaCMemory.load("nonexistent")


def test_save_invalid_raises(tmp_memory_dir):
    with pytest.raises(Exception):
        ATaCMemory.save({"name": "ok", "steps": []})


# ------------------------------------------------------------------ list_all


def test_list_all_empty(tmp_memory_dir):
    assert ATaCMemory.list_all() == []


def test_list_all_returns_summaries(tmp_memory_dir):
    ATaCMemory.save(VALID_MEMORY)

    second = {
        **VALID_MEMORY,
        "name": "second-record",
        "description": "Another one",
        "tags": ["b"],
    }
    legacy_path = ATaCMemory.resolve_legacy_path("second-record")
    legacy_path.write_text(yaml.safe_dump(second, sort_keys=False), encoding="utf-8")

    records = ATaCMemory.list_all()
    names = [r["name"] for r in records]
    assert "test_query" in names
    assert "second-record" in names
    assert "steps" not in records[0]


# ------------------------------------------------------------------ delete


def test_delete_removes_bundle_dir(tmp_memory_dir):
    ATaCMemory.save(VALID_MEMORY)
    ATaCMemory.delete("test_query")
    assert not ATaCMemory.resolve_path("test_query").exists()


def test_delete_not_found(tmp_memory_dir):
    with pytest.raises(FileNotFoundError):
        ATaCMemory.delete("nonexistent")


# ------------------------------------------------------------------ search


def test_search_by_name(tmp_memory_dir):
    ATaCMemory.save(VALID_MEMORY)
    results = ATaCMemory.search("test")
    assert len(results) == 1
    assert results[0]["name"] == "test_query"


def test_search_by_description(tmp_memory_dir):
    ATaCMemory.save(VALID_MEMORY)
    results = ATaCMemory.search("memory record")
    assert len(results) == 1


def test_search_by_tag(tmp_memory_dir):
    ATaCMemory.save(VALID_MEMORY)
    results = ATaCMemory.search("example")
    assert len(results) == 1


def test_search_no_match(tmp_memory_dir):
    ATaCMemory.save(VALID_MEMORY)
    results = ATaCMemory.search("zzznomatch")
    assert results == []


def test_search_case_insensitive(tmp_memory_dir):
    ATaCMemory.save(VALID_MEMORY)
    results = ATaCMemory.search("TEST")
    assert len(results) == 1


def test_search_multi_keywords(tmp_memory_dir):
    ATaCMemory.save(VALID_MEMORY)
    results = ATaCMemory.search("test example")
    assert len(results) == 1

    results = ATaCMemory.search("record test")
    assert len(results) == 1

    results = ATaCMemory.search("test missing")
    assert len(results) == 0
