from fastapi.testclient import TestClient

from atac.http_server import create_app
from atac.service import AtacService


def _echo_wrapper():
    class EchoWrapper:
        def invoke(self, args, context):
            _ = context
            return args.get("command", "")

    return EchoWrapper()


def test_http_service_graph_tool_call_and_health_endpoints(tmp_path, monkeypatch):
    service = AtacService()
    service.register_tool("bash", _echo_wrapper())
    pkg_dir = tmp_path / "graphhttpapp"
    pkg_dir.mkdir()
    (pkg_dir / "__init__.py").write_text("", encoding="utf-8")
    (pkg_dir / "graph_module.py").write_text(
        "from atac import get_service\n"
        "class FakeGraph:\n"
        "    def invoke(self, state):\n"
        "        return {'result': get_service().tool_call('bash', {'command': state['command']})}\n"
        "def build_graph():\n"
        "    return FakeGraph()\n",
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(tmp_path))
    app = create_app(service)
    client = TestClient(app)

    health_resp = client.get("/health")
    assert health_resp.status_code == 200
    assert health_resp.json()["ok"] is True
    assert "bash" in health_resp.json()["tools"]

    graph_resp = client.post(
        "/v1/graph",
        json={
                "graph_spec": "graphhttpapp.graph_module:build_graph",
            "state": {"command": "echo api"},
        },
    )
    assert graph_resp.status_code == 200
    assert graph_resp.json()["ok"] is True
    assert graph_resp.json()["result"] == {"result": "echo api"}

    tool_resp = client.post(
        "/v1/tool-call",
        json={"tool_name": "bash", "args": {"command": "echo direct"}},
    )
    assert tool_resp.status_code == 200
    assert tool_resp.json()["ok"] is True
    assert tool_resp.json()["result"] == "echo direct"
