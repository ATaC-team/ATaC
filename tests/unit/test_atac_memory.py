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
        {"tool": "execute_query", "note": "Run query with filters", "args": {"entity_name": "sections"}},
        {"tool": "discover_entities"},
    ],
}


@pytest.fixture(autouse=True)
def tmp_memory_dir(tmp_path, monkeypatch):
    """Redirect .atac/.memory to a temp directory for each test."""
    mem_dir = tmp_path / ".atac" / ".memory"
    mem_dir.mkdir(parents=True)
    monkeypatch.setattr(ATaCMemory, "BASE_DIR", mem_dir)
    return mem_dir


# ------------------------------------------------------------------ validate

def test_validate_valid():
    ATaCMemory.validate(VALID_MEMORY)  # should not raise


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
    ATaCMemory.validate(data)  # should not raise


def test_validate_step_tool_only():
    data = {**VALID_MEMORY, "steps": [{"tool": "some_tool"}]}
    ATaCMemory.validate(data)  # should not raise


# ------------------------------------------------------------------ save / load

def test_save_creates_file(tmp_memory_dir):
    path = ATaCMemory.save(VALID_MEMORY)
    assert path.exists()
    content = yaml.safe_load(path.read_text(encoding="utf-8"))
    assert content["name"] == "test_query"


def test_load_returns_dict(tmp_memory_dir):
    ATaCMemory.save(VALID_MEMORY)
    data = ATaCMemory.load("test_query")
    assert data["name"] == "test_query"
    assert data["description"] == VALID_MEMORY["description"]


def test_load_not_found(tmp_memory_dir):
    with pytest.raises(FileNotFoundError):
        ATaCMemory.load("nonexistent")


def test_save_invalid_raises(tmp_memory_dir):
    with pytest.raises(Exception):
        ATaCMemory.save({"name": "ok", "steps": []})  # missing description + empty steps


# ------------------------------------------------------------------ list_all

def test_list_all_empty(tmp_memory_dir):
    assert ATaCMemory.list_all() == []


def test_list_all_returns_summaries(tmp_memory_dir):
    ATaCMemory.save(VALID_MEMORY)
    second = {**VALID_MEMORY, "name": "second-record", "description": "Another one", "tags": ["b"]}
    ATaCMemory.save(second)

    records = ATaCMemory.list_all()
    names = [r["name"] for r in records]
    assert "test_query" in names
    assert "second-record" in names
    # only summary fields
    assert "steps" not in records[0]


# ------------------------------------------------------------------ delete

def test_delete_removes_file(tmp_memory_dir):
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
    # Match name and tag
    results = ATaCMemory.search("test example")
    assert len(results) == 1

    # Match description and tag
    results = ATaCMemory.search("record test")
    assert len(results) == 1

    # Missing one keyword
    results = ATaCMemory.search("test missing")
    assert len(results) == 0
