import os
from pathlib import Path

import yaml
from click.testing import CliRunner

from atac.cli.main import cli
from atac.core.atac_memory import ATaCMemory


def test_cli_workspace_flow(tmp_path):
    # Change the current working directory to the temporary path
    # so that the .atac workspace is created there.
    os.chdir(tmp_path)

    runner = CliRunner()

    # 1. Init a workspace
    result = runner.invoke(
        cli, ["init", "my_flow", "--description", "A test workspace"]
    )
    assert result.exit_code == 0
    assert "Initialized ATaC workspace" in result.output

    workspace_dir = tmp_path / ".atac" / "my_flow"
    index_file = workspace_dir / "index.yaml"

    assert workspace_dir.exists()
    assert index_file.exists()

    # 2. Add an input
    result = runner.invoke(cli, ["add-input", "my_flow", "--name", "target_url"])
    assert result.exit_code == 0

    # 3. Add an action
    result = runner.invoke(
        cli, ["add-action", "my_flow", "--id", "fetch_data", "--action", "bash://run"]
    )
    assert result.exit_code == 0

    # 4. Show the workspace
    result = runner.invoke(cli, ["show", "my_flow"])
    assert result.exit_code == 0
    assert "Trajectory Workspace: my_flow" in result.output
    assert "fetch_data" in result.output


def test_cli_global_cwd_flow(tmp_path):
    # Do NOT change directory. We use the global -C / --cwd flag to target tmp_path
    runner = CliRunner()

    cwd_str = str(tmp_path)

    # 1. Init a workspace using -C
    result = runner.invoke(
        cli,
        ["-C", cwd_str, "init", "remote_flow", "--description", "A remote workspace"],
    )
    assert result.exit_code == 0
    assert "Initialized ATaC workspace" in result.output

    workspace_dir = tmp_path / ".atac" / "remote_flow"
    index_file = workspace_dir / "index.yaml"

    assert workspace_dir.exists()
    assert index_file.exists()

    # 2. Add an input
    result = runner.invoke(
        cli, ["--cwd", cwd_str, "add-input", "remote_flow", "--name", "target_url"]
    )
    assert result.exit_code == 0

    # 3. Add an action
    result = runner.invoke(
        cli,
        [
            "-C",
            cwd_str,
            "add-action",
            "remote_flow",
            "--id",
            "fetch_data",
            "--action",
            "bash://run",
        ],
    )
    assert result.exit_code == 0

    # 4. Show the workspace
    result = runner.invoke(cli, ["-C", cwd_str, "show", "remote_flow"])
    assert result.exit_code == 0
    assert "Trajectory Workspace: remote_flow" in result.output
    assert "fetch_data" in result.output


def test_cli_memory_save_from_yaml_and_read(tmp_path):
    runner = CliRunner()

    source_file = tmp_path / "memory.yaml"
    source_file.write_text(
        yaml.safe_dump(
            {
                "name": "sales_memory",
                "description": "Remember the sales ranking workflow",
                "tags": ["sales", "ranking"],
                "steps": [{"note": "Check date granularity first"}],
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )

    result = runner.invoke(cli, ["-C", str(tmp_path), "memory", "save", str(source_file)])
    assert result.exit_code == 0
    assert "sales_memory" in result.output

    entry_path = tmp_path / ".atac" / ".memory" / "sales_memory" / ATaCMemory.ENTRY_FILE
    assert entry_path.exists()

    result = runner.invoke(cli, ["-C", str(tmp_path), "memory", "read", "sales_memory"])
    assert result.exit_code == 0
    assert "Remember the sales ranking workflow" in result.output


def test_cli_memory_save_from_bundle_dir(tmp_path):
    runner = CliRunner()

    source_dir = tmp_path / "memory_bundle"
    source_dir.mkdir()
    entry_path = source_dir / ATaCMemory.ENTRY_FILE
    entry_path.write_text(
        yaml.safe_dump(
            {
                "name": "bundle_memory",
                "description": "Memory bundle with scripts",
                "tags": ["bundle"],
                "steps": [{"tool": "memory_search", "note": "Reuse prior bundle"}],
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    scripts_dir = source_dir / "scripts"
    scripts_dir.mkdir()
    (scripts_dir / "helper.sh").write_text("echo helper\n", encoding="utf-8")

    result = runner.invoke(cli, ["-C", str(tmp_path), "memory", "save", str(source_dir)])
    assert result.exit_code == 0
    assert "bundle_memory" in result.output

    saved_bundle = tmp_path / ".atac" / ".memory" / "bundle_memory"
    assert (saved_bundle / "index.yaml").exists()
    assert (saved_bundle / "scripts" / "helper.sh").exists()


def test_cli_memory_mcp_respects_memory_dir_flag(tmp_path, monkeypatch):
    runner = CliRunner()
    captured = {}
    monkeypatch.setattr(ATaCMemory, "BASE_DIR", Path(".atac/.memory"))

    def fake_run():
        captured["base_dir"] = ATaCMemory.BASE_DIR

    monkeypatch.setattr("atac.mcp.memory_server.mcp.run", fake_run)

    custom_dir = tmp_path / "custom-memory"
    result = runner.invoke(cli, ["memory-mcp", "--memory-dir", str(custom_dir)])

    assert result.exit_code == 0
    assert captured["base_dir"] == custom_dir


def test_cli_memory_mcp_uses_env_when_flag_missing(tmp_path, monkeypatch):
    runner = CliRunner()
    captured = {}
    monkeypatch.setattr(ATaCMemory, "BASE_DIR", Path(".atac/.memory"))

    def fake_run():
        captured["base_dir"] = ATaCMemory.BASE_DIR

    monkeypatch.setattr("atac.mcp.memory_server.mcp.run", fake_run)

    env_dir = tmp_path / "env-memory"
    result = runner.invoke(
        cli,
        ["memory-mcp"],
        env={**os.environ, "ATAC_MEMORY_DIR": str(env_dir)},
    )

    assert result.exit_code == 0
    assert captured["base_dir"] == env_dir


def test_cli_memory_mcp_flag_overrides_env(tmp_path, monkeypatch):
    runner = CliRunner()
    captured = {}
    monkeypatch.setattr(ATaCMemory, "BASE_DIR", Path(".atac/.memory"))

    def fake_run():
        captured["base_dir"] = ATaCMemory.BASE_DIR

    monkeypatch.setattr("atac.mcp.memory_server.mcp.run", fake_run)

    env_dir = tmp_path / "env-memory"
    flag_dir = tmp_path / "flag-memory"
    result = runner.invoke(
        cli,
        ["memory-mcp", "--memory-dir", str(flag_dir)],
        env={**os.environ, "ATAC_MEMORY_DIR": str(env_dir)},
    )

    assert result.exit_code == 0
    assert captured["base_dir"] == flag_dir
