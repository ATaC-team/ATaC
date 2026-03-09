from __future__ import annotations

import pytest
import yaml

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


def test_mcp_tools_run_graph(tmp_path):
    service = _GraphService()
    tools = AtacMCPTools(service, tmp_path)

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


def test_mcp_tools_run_graph_resolves_saved_graph_name(tmp_path):
    service = _GraphService()
    tools = AtacMCPTools(service, tmp_path)

    result = tools.run_graph("demo_graph", {"who": "alice"})

    assert result == {
        "ok": True,
        "graph": "demo_graph",
        "result": {
            "graph_spec": "demo_graph.graph:build_graph",
            "state": {"who": "alice"},
        },
    }
    assert service.calls == [("demo_graph.graph:build_graph", {"who": "alice"})]


def test_mcp_tools_save_graph_and_list_graph(tmp_path):
    service = _GraphService()
    tools = AtacMCPTools(service, tmp_path)

    graph_code = (
        "class FakeGraph:\n"
        "    def invoke(self, state):\n"
        "        return {'ok': True, 'state': state}\n\n"
        "def build_graph():\n"
        "    return FakeGraph()\n"
    )
    saved = tools.save_graph(
        "trip_planner",
        graph_code,
        "Plan a trip with saved graph code.",
        [{"name": "destination", "type": "string", "required": True}],
        [{"name": "plan", "type": "object"}],
        {"destination": "Hangzhou"},
    )

    assert saved == {
        "ok": True,
        "name": "trip_planner",
        "directory": str(tmp_path / "trip_planner"),
        "graph_spec": "trip_planner.graph:build_graph",
    }
    assert (tmp_path / "trip_planner" / "__init__.py").exists()
    assert (tmp_path / "trip_planner" / "graph.py").read_text(encoding="utf-8") == graph_code
    assert yaml.safe_load(
        (tmp_path / "trip_planner" / "description.yaml").read_text(encoding="utf-8")
    ) == {
        "name": "trip_planner",
        "description": "Plan a trip with saved graph code.",
        "graph_spec": "trip_planner.graph:build_graph",
        "inputs": [{"name": "destination", "type": "string", "required": True}],
        "outputs": [{"name": "plan", "type": "object"}],
        "example_state": {"destination": "Hangzhou"},
    }

    listed = tools.list_graph()

    assert listed == [
        {
            "name": "trip_planner",
            "description": "Plan a trip with saved graph code.",
            "graph_spec": "trip_planner.graph:build_graph",
            "inputs": [{"name": "destination", "type": "string", "required": True}],
            "outputs": [{"name": "plan", "type": "object"}],
            "example_state": {"destination": "Hangzhou"},
            "directory": str(tmp_path / "trip_planner"),
        }
    ]

    graph_payload = tools.get_graph("trip_planner")

    assert graph_payload == {
        "ok": True,
        "name": "trip_planner",
        "directory": str(tmp_path / "trip_planner"),
        "description": {
            "name": "trip_planner",
            "description": "Plan a trip with saved graph code.",
            "graph_spec": "trip_planner.graph:build_graph",
            "inputs": [{"name": "destination", "type": "string", "required": True}],
            "outputs": [{"name": "plan", "type": "object"}],
            "example_state": {"destination": "Hangzhou"},
        },
        "graph_code": graph_code,
    }


def test_mcp_tools_save_graph_validates_build_graph(tmp_path):
    service = _GraphService()
    tools = AtacMCPTools(service, tmp_path)

    with pytest.raises(AttributeError):
        tools.save_graph(
            "broken_graph",
            "def not_build_graph():\n    return None\n",
            "Broken graph.",
            [{"name": "who", "type": "string"}],
            [{"name": "message", "type": "string"}],
            {"who": "alice"},
        )

    assert not (tmp_path / "broken_graph").exists()
