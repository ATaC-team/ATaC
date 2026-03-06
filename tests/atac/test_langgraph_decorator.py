from __future__ import annotations

import pytest
from langchain_core.messages.tool import ToolMessage
from langchain_core.tools import BaseTool

from atac import set_service
from atac.service import AtacService
from atac.wrapper.langgraph import tool as atac_langgraph_tool


@pytest.fixture(autouse=True)
def _reset_global_service():
    set_service(None)
    yield
    set_service(None)


def test_decorator_preserves_metadata_and_registers_tool():
    service = AtacService()
    set_service(service)

    @atac_langgraph_tool(name="echo")
    def echo(text: str) -> str:
        """Echo input text."""
        return text

    assert isinstance(echo, BaseTool)
    assert echo.name == "echo"
    assert echo.description == "Echo input text."
    assert echo.args_schema is not None
    assert "echo" in service.list_tools()


def test_decorator_keeps_direct_invoke_output_unchanged():
    service = AtacService()
    set_service(service)

    @atac_langgraph_tool(name="echo")
    def echo(text: str) -> str:
        """Echo input text."""
        return text

    result = echo.invoke({"text": "x"})

    assert result == "x"


def test_decorator_tool_still_works_with_tool_call_id():
    service = AtacService()
    set_service(service)

    @atac_langgraph_tool(name="echo")
    def echo(text: str) -> str:
        """Echo input text."""
        return text

    message = echo.run({"text": "x"}, tool_call_id="call-1")

    assert isinstance(message, ToolMessage)
    assert message.content == "x"


def test_decorator_registered_tool_can_be_run_by_service():
    service = AtacService()
    set_service(service)

    @atac_langgraph_tool(name="echo")
    def echo(text: str) -> str:
        """Echo input text."""
        return text

    assert service.tool_call("echo", {"text": "demo"}) == "demo"


def test_decorator_raises_when_global_service_not_set():
    with pytest.raises(RuntimeError, match="Call atac.set_service"):
        @atac_langgraph_tool(name="echo")
        def echo(text: str) -> str:
            """Echo input text."""
            return text

        _ = echo
