from __future__ import annotations

import pytest

from atac import set_service
from atac.service import AtacService
from atac.wrapper.langgraph import MultiServerMCPClient


class _FakeMCPTool:
    def __init__(self, name: str, output: str) -> None:
        self.name = name
        self._output = output

    def invoke(self, args: dict[str, str]) -> str:
        _ = args
        return self._output


@pytest.fixture(autouse=True)
def _reset_global_service():
    set_service(None)
    yield
    set_service(None)


@pytest.mark.asyncio
async def test_mcp_client_register_to_atac_async(monkeypatch):
    service = AtacService()
    set_service(service)

    async def _fake_aenter(self):
        return self

    async def _fake_aexit(self, exc_type, exc, tb):
        _ = (exc_type, exc, tb)

    async def _fake_get_tools(self):
        return [_FakeMCPTool("echo", "ok"), _FakeMCPTool("skip", "x")]

    monkeypatch.setattr(MultiServerMCPClient, "__aenter__", _fake_aenter, raising=False)
    monkeypatch.setattr(MultiServerMCPClient, "__aexit__", _fake_aexit, raising=False)
    monkeypatch.setattr(MultiServerMCPClient, "get_tools", _fake_get_tools, raising=False)

    try:
        client = MultiServerMCPClient(
            {"local": {"transport": "stdio", "command": "python", "args": ["server.py"]}},
            auto_register=False,
        )
    except ImportError:
        pytest.skip("langchain_mcp_adapters is not available")

    registered = await client.register_to_atac_async(
        prefix="mcp",
        exclude={"skip"},
    )
    assert registered == ["mcp.echo"]
    assert "mcp.echo" in service.list_tools()


def test_mcp_client_auto_registers_in_constructor(monkeypatch):
    service = AtacService()
    set_service(service)

    async def _fake_aenter(self):
        return self

    async def _fake_aexit(self, exc_type, exc, tb):
        _ = (exc_type, exc, tb)

    async def _fake_get_tools(self):
        return [_FakeMCPTool("echo", "mcp-echo-ok")]

    monkeypatch.setattr(MultiServerMCPClient, "__aenter__", _fake_aenter, raising=False)
    monkeypatch.setattr(MultiServerMCPClient, "__aexit__", _fake_aexit, raising=False)
    monkeypatch.setattr(MultiServerMCPClient, "get_tools", _fake_get_tools, raising=False)

    try:
        _ = MultiServerMCPClient(
            {"local": {"transport": "stdio", "command": "python", "args": ["server.py"]}},
            prefix="mcp",
            auto_register=True,
        )
    except ImportError:
        pytest.skip("langchain_mcp_adapters is not available")

    assert service.tool_call("mcp.echo", {}) == "mcp-echo-ok"


def test_mcp_client_raises_when_global_service_not_set():
    try:
        with pytest.raises(RuntimeError, match="Call atac.set_service"):
            _ = MultiServerMCPClient(
                {"local": {"transport": "stdio", "command": "python", "args": ["server.py"]}},
                auto_register=True,
            )
    except ImportError:
        pytest.skip("langchain_mcp_adapters is not available")
