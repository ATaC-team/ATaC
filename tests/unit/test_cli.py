import os

from click.testing import CliRunner

from atac.cli.main import cli


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
