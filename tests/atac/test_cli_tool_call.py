from __future__ import annotations

import json

from click.testing import CliRunner

from atac.cli.main import cli


def test_cli_tool_call_local_with_bootstrap_and_args(tmp_path, monkeypatch):
    runner = CliRunner()

    pkg_dir = tmp_path / "callapp"
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
    monkeypatch.syspath_prepend(str(tmp_path))

    result = runner.invoke(
        cli,
        [
            "tool_call",
            "upper",
            "--arg",
            "text=alice",
        ],
        env={"ATAC_BOOTSTRAP": "callapp.bootstrap:get_service"},
    )

    assert result.exit_code == 0
    payload = json.loads(result.output)
    assert payload["ok"] is True
    assert payload["tool"] == "upper"
    assert payload["result"] == "ALICE"
    assert payload["error"] is None


def test_cli_tool_call_rejects_invalid_arg_pair():
    runner = CliRunner()
    result = runner.invoke(
        cli,
        [
            "tool_call",
            "upper",
            "--arg",
            "broken_pair",
        ],
    )

    assert result.exit_code != 0
    assert "Each --arg must be in key=value format" in result.output


def test_cli_tool_call_unregistered_tool_fails(tmp_path, monkeypatch):
    runner = CliRunner()

    pkg_dir = tmp_path / "emptyapp"
    pkg_dir.mkdir()
    (pkg_dir / "__init__.py").write_text("", encoding="utf-8")
    (pkg_dir / "bootstrap.py").write_text(
        "from atac.service import AtacService\n"
        "def get_service():\n"
        "    return AtacService()\n",
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(tmp_path))

    result = runner.invoke(
        cli,
        [
            "tool_call",
            "missing",
        ],
        env={"ATAC_BOOTSTRAP": "emptyapp.bootstrap:get_service"},
    )

    assert result.exit_code != 0
    assert "Tool 'missing' is not registered" in result.output


def test_cli_tool_call_requires_bootstrap_env():
    runner = CliRunner()
    result = runner.invoke(cli, ["tool_call", "upper", "--arg", "text=alice"], env={})

    assert result.exit_code != 0
    assert "ATAC_BOOTSTRAP is required for tool_call" in result.output
