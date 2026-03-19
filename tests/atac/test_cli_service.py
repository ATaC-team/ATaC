from click.testing import CliRunner

from atac.cli.main import cli
from atac.service import AtacService


def test_cli_service_start_loads_bootstrap_and_runs_uvicorn(monkeypatch):
    runner = CliRunner()
    captured: dict = {}
    fake_service = AtacService()

    def fake_load(spec: str):
        captured["bootstrap"] = spec
        return fake_service

    def fake_create_app(service):
        captured["service"] = service
        return {"app": "ok"}

    def fake_uvicorn_run(app, host, port):
        captured["app"] = app
        captured["host"] = host
        captured["port"] = port

    monkeypatch.setattr("atac.cli.main.load_service_from_bootstrap", fake_load)
    monkeypatch.setattr("atac.cli.main.create_app", fake_create_app)
    monkeypatch.setattr("atac.cli.main.uvicorn.run", fake_uvicorn_run)

    result = runner.invoke(
        cli,
        [
            "service",
            "start",
            "--bootstrap",
            "myapp.bootstrap:get_service",
            "--host",
            "127.0.0.1",
            "--port",
            "8787",
        ],
    )

    assert result.exit_code == 0
    assert "ATaC service starting on http://127.0.0.1:8787" in result.output
    assert captured["bootstrap"] == "myapp.bootstrap:get_service"
    assert captured["service"] is fake_service
    assert captured["app"] == {"app": "ok"}
    assert captured["host"] == "127.0.0.1"
    assert captured["port"] == 8787


def test_cli_mcp_loads_service_and_runs_server(monkeypatch):
    runner = CliRunner()
    captured: dict = {}
    fake_service = AtacService()

    class FakeMCPServer:
        def run(self) -> None:
            captured["ran"] = True

    def fake_load():
        captured["loaded"] = True
        return fake_service

    def fake_create_mcp_server(service, *, atac_dir: str, server_name: str):
        captured["service"] = service
        captured["atac_dir"] = atac_dir
        captured["server_name"] = server_name
        return FakeMCPServer()

    monkeypatch.setattr("atac.cli.main.load_mcp_service_from_env", fake_load)
    monkeypatch.setattr("atac.cli.main.create_mcp_server", fake_create_mcp_server)

    result = runner.invoke(
        cli,
        [
            "mcp",
            "--atac-dir",
            "/tmp/atac-graphs",
            "--server-name",
            "ATaC Test MCP",
        ],
    )

    assert result.exit_code == 0
    assert captured["loaded"] is True
    assert captured["service"] is fake_service
    assert captured["atac_dir"] == "/tmp/atac-graphs"
    assert captured["server_name"] == "ATaC Test MCP"
    assert captured["ran"] is True


def test_cli_mcp_requires_atac_dir(monkeypatch):
    runner = CliRunner()
    monkeypatch.setattr("atac.cli.main.load_mcp_service_from_env", lambda: AtacService())

    result = runner.invoke(cli, ["mcp"], env={})

    assert result.exit_code != 0
    assert "ATAC_DIR" in result.output or "--atac-dir" in result.output


def test_cli_graph_loads_graph_and_binds_service(tmp_path, monkeypatch):
    runner = CliRunner()

    pkg_dir = tmp_path / "graphapp"
    pkg_dir.mkdir()
    (pkg_dir / "__init__.py").write_text("", encoding="utf-8")
    (pkg_dir / "bootstrap.py").write_text(
        "from atac.service import AtacService\n"
        "class UpperWrapper:\n"
        "    def invoke(self, args, context):\n"
        "        _ = context\n"
        "        return str(args.get('text', '')).upper()\n"
        "def get_service():\n"
        "    service = AtacService()\n"
        "    service.register_tool('upper', UpperWrapper())\n"
        "    return service\n",
        encoding="utf-8",
    )
    (pkg_dir / "graph_module.py").write_text(
        "from atac import get_service\n"
        "class FakeGraph:\n"
        "    def invoke(self, state):\n"
        "        service = get_service()\n"
        "        result = service.tool_call('upper', {'text': state['who']})\n"
        "        return {'result': result}\n"
        "def build_graph():\n"
        "    return FakeGraph()\n",
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(tmp_path))

    result = runner.invoke(
        cli,
        [
            "graph",
            "run",
            "graphapp.graph_module:build_graph",
            "--bootstrap",
            "graphapp.bootstrap:get_service",
            "--input",
            "who=alice",
        ],
    )

    assert result.exit_code == 0
    assert '"result": "ALICE"' in result.output


def test_cli_graph_list_reads_graphs_from_atac_dir(monkeypatch):
    runner = CliRunner()

    class FakeTools:
        def list_graph(self):
            return [{"name": "demo", "description": "Demo graph"}]

    monkeypatch.setattr("atac.cli.main._build_graph_tools", lambda **_: FakeTools())

    result = runner.invoke(cli, ["graph", "list", "--atac-dir", "/tmp/graphs"])

    assert result.exit_code == 0
    assert '"name": "demo"' in result.output


def test_cli_graph_get_reads_single_graph_from_atac_dir(monkeypatch):
    runner = CliRunner()

    class FakeTools:
        def get_graph(self, name: str, *, include_code: bool):
            return {"ok": True, "name": name, "include_code": include_code}

    monkeypatch.setattr("atac.cli.main._build_graph_tools", lambda **_: FakeTools())

    result = runner.invoke(
        cli,
        ["graph", "get", "demo", "--atac-dir", "/tmp/graphs", "--include-code"],
    )

    assert result.exit_code == 0
    assert '"name": "demo"' in result.output
    assert '"include_code": true' in result.output


def test_cli_graph_run_uses_atac_dir_for_name_based_graphs(monkeypatch):
    runner = CliRunner()
    captured: dict = {}

    class FakeTools:
        async def run_graph(self, graph_spec: str, state: dict):
            captured["graph_spec"] = graph_spec
            captured["state"] = state
            return {"ok": True, "graph": graph_spec, "result": state}

    monkeypatch.setattr("atac.cli.main._build_graph_tools", lambda **_: FakeTools())

    result = runner.invoke(
        cli,
        [
            "graph",
            "run",
            "demo",
            "--atac-dir",
            "/tmp/graphs",
            "--input",
            "who=alice",
        ],
    )

    assert result.exit_code == 0
    assert captured["graph_spec"] == "demo"
    assert captured["state"] == {"who": "alice"}
    assert '"graph": "demo"' in result.output
