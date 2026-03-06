from pathlib import Path

from langchain_core.tools import tool

from atac import get_runtime_context
from atac.service import AtacService


def test_service_starts_without_pre_registered_tools():
    service = AtacService()

    assert service.list_tools() == []


def test_service_register_langgraph_tool():
    service = AtacService()

    @tool("search_tool")
    def search_tool(q: str) -> str:
        """Search test tool."""
        return f"result:{q}"

    service.register_langgraph_tool("search", search_tool)

    assert "search" in service.list_tools()


def test_service_tool_call_invokes_registered_wrapper():
    service = AtacService()

    class UpperWrapper:
        def invoke(self, args, context):
            assert context["step_index"] == -1
            return str(args["text"]).upper()

    service.register_tool("upper", UpperWrapper())

    result = service.tool_call("upper", {"text": "alice"})

    assert result == "ALICE"


def test_service_tool_call_binds_runtime_context_for_langgraph_tool():
    service = AtacService()

    @tool("ctx_tool")
    def ctx_tool(text: str) -> str:
        """Return bound runtime workdir."""
        _ = text
        context = get_runtime_context()
        return str(context.workdir)

    service.register_langgraph_tool("ctx_tool", ctx_tool)

    result = service.tool_call("ctx_tool", {"text": "x"})

    assert result == str(Path.cwd())


def test_service_load_graph_binds_global_service(tmp_path, monkeypatch):
    service = AtacService()

    pkg_dir = tmp_path / "graphpkg"
    pkg_dir.mkdir()
    (pkg_dir / "__init__.py").write_text("", encoding="utf-8")
    (pkg_dir / "graph_module.py").write_text(
        "from atac import get_service\n"
        "class FakeGraph:\n"
        "    def invoke(self, state):\n"
        "        return {'ok': get_service() is not None, 'state': state}\n"
        "def build_graph():\n"
        "    return FakeGraph()\n",
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(tmp_path))

    app = service.load_graph("graphpkg.graph_module:build_graph")

    assert app.invoke({"x": 1}) == {"ok": True, "state": {"x": 1}}


def test_service_run_graph_executes_graph_with_bound_service(tmp_path, monkeypatch):
    service = AtacService()

    class UpperWrapper:
        def invoke(self, args, context):
            _ = context
            return str(args["text"]).upper()

    service.register_tool("upper", UpperWrapper())

    pkg_dir = tmp_path / "graphpkg2"
    pkg_dir.mkdir()
    (pkg_dir / "__init__.py").write_text("", encoding="utf-8")
    (pkg_dir / "graph_module.py").write_text(
        "from atac import get_service\n"
        "class FakeGraph:\n"
        "    def invoke(self, state):\n"
        "        return {'result': get_service().tool_call('upper', {'text': state['who']})}\n"
        "def build_graph():\n"
        "    return FakeGraph()\n",
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(tmp_path))

    result = service.run_graph("graphpkg2.graph_module:build_graph", {"who": "alice"})

    assert result == {"result": "ALICE"}
