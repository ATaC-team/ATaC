import pytest

from atac.tools.registry import ToolRegistry


class RawWrapper:
    def __init__(self, value):
        self._value = value

    def invoke(self, args, context):
        return self._value


def test_registry_register_and_resolve():
    registry = ToolRegistry()
    wrapper = RawWrapper("ok")

    registry.register("bash", wrapper)

    assert registry.has("bash")
    assert registry.resolve("bash") is wrapper
    assert registry.list_names() == ["bash"]


def test_registry_resolve_missing_tool():
    registry = ToolRegistry()

    with pytest.raises(KeyError):
        registry.resolve("missing")


def test_registry_rejects_empty_name():
    registry = ToolRegistry()
    wrapper = RawWrapper(None)

    with pytest.raises(ValueError):
        registry.register("", wrapper)
