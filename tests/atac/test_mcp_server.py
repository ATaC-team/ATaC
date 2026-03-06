from __future__ import annotations

from atac.mcp.server import AtacMCPTools
from atac.service import AtacService


class _GraphService(AtacService):
    def __init__(self) -> None:
        super().__init__()
        self.calls: list[tuple[str, dict[str, object]]] = []

    def run_graph(
        self,
        graph_spec: str,
        state: dict[str, object],
    ) -> dict[str, object]:
        self.calls.append((graph_spec, state))
        return {"graph_spec": graph_spec, "state": state}


def test_mcp_tools_run_graph():
    service = _GraphService()
    tools = AtacMCPTools(service)

    result = tools.run_graph("demo.graph:build_graph", {"who": "alice"})

    assert result == {
        "ok": True,
        "graph": "demo.graph:build_graph",
        "result": {
            "graph_spec": "demo.graph:build_graph",
            "state": {"who": "alice"},
        },
    }
    assert service.calls == [("demo.graph:build_graph", {"who": "alice"})]
