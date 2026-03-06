import pytest
from langchain_core.tools import tool

from atac.adapters import LangGraphToolAdapter
from atac.runtime_context import get_runtime_context


def test_langgraph_wrapper_with_real_tool_invoke():
    @tool("echo_text")
    def echo_text(text: str) -> str:
        """Echo text for testing."""
        return text

    wrapper = LangGraphToolAdapter(echo_text)
    result = wrapper.invoke({"text": "x"}, {})

    assert result == "x"


def test_langgraph_wrapper_with_real_tool_ainvoke():
    @tool("echo_async")
    async def echo_async(text: str) -> str:
        """Echo text asynchronously for testing."""
        return f"async:{text}"

    wrapper = LangGraphToolAdapter(echo_async)
    result = wrapper.invoke({"text": "x"}, {})

    assert result == "async:x"


def test_langgraph_wrapper_error_propagation():
    @tool("broken_tool")
    def broken_tool(text: str) -> str:
        """Raise an error to test propagation."""
        raise RuntimeError("boom")

    wrapper = LangGraphToolAdapter(broken_tool)
    with pytest.raises(RuntimeError, match="boom"):
        wrapper.invoke({"text": "x"}, {})


def test_langgraph_wrapper_binds_runtime_context_for_tool():
    @tool("inspect_context")
    def inspect_context():
        """Return the currently bound runtime context."""
        return get_runtime_context()

    wrapper = LangGraphToolAdapter(inspect_context)
    result = wrapper.invoke(
        {},
        {"cwd": "/tmp/demo"},
    )

    assert result["cwd"] == "/tmp/demo"
    assert result.workdir == result.cwd
