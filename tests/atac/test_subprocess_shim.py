from __future__ import annotations

import os

import atac.subprocess as atac_subprocess
from atac.runtime_context import bind_runtime_context


def test_subprocess_run_injects_runtime_workdir_and_env(tmp_path):
    workdir = tmp_path / "workdir"
    workdir.mkdir(parents=True)

    with bind_runtime_context({"cwd": str(workdir)}):
        completed = atac_subprocess.run(
            'printf "%s\\n%s" "$PWD" "$HOME"',
            shell=True,
            capture_output=True,
            text=True,
        )

    pwd, home = completed.stdout.splitlines()
    assert pwd == str(workdir)
    assert home == os.environ["HOME"]


def test_subprocess_run_respects_explicit_cwd_and_env(tmp_path):
    workdir = tmp_path / "workdir"
    workdir.mkdir()
    override_path = tmp_path / "override"
    override_path.mkdir()

    with bind_runtime_context({"cwd": str(workdir)}):
        completed = atac_subprocess.run(
            'printf "%s\\n%s" "$PWD" "$HELLO"',
            shell=True,
            capture_output=True,
            text=True,
            cwd=override_path,
            env={**os.environ, "HELLO": "world"},
        )

    pwd, hello = completed.stdout.splitlines()
    assert pwd == str(override_path)
    assert hello == "world"
