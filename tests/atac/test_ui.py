from click.testing import CliRunner

from atac.cli.main import cli
from atac.ui import get_ui_dist_resource


def test_get_ui_dist_resource_contains_index_html():
    dist_dir = get_ui_dist_resource()

    assert dist_dir.joinpath("index.html").is_file()
    assert dist_dir.joinpath("assets").joinpath("index-BgSdTKN5.js").is_file()


def test_cli_ui_delegates_to_static_server(monkeypatch):
    runner = CliRunner()
    captured: dict[str, object] = {}

    def fake_serve_ui(host: str, port: int, *, open_browser: bool) -> None:
        captured["host"] = host
        captured["port"] = port
        captured["open_browser"] = open_browser

    monkeypatch.setattr("atac.cli.main.serve_ui", fake_serve_ui)

    result = runner.invoke(cli, ["ui", "--host", "127.0.0.1", "--port", "4173", "--no-open"])

    assert result.exit_code == 0
    assert captured == {
        "host": "127.0.0.1",
        "port": 4173,
        "open_browser": False,
    }
