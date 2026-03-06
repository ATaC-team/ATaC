"""Context-aware subprocess shim for ATaC tools."""

from __future__ import annotations

import subprocess as _subprocess
from typing import Any

from atac.runtime_context import get_runtime_context

PIPE = _subprocess.PIPE
STDOUT = _subprocess.STDOUT
DEVNULL = _subprocess.DEVNULL
CalledProcessError = _subprocess.CalledProcessError
TimeoutExpired = _subprocess.TimeoutExpired
SubprocessError = _subprocess.SubprocessError
CompletedProcess = _subprocess.CompletedProcess


def _inject_defaults(kwargs: dict[str, Any]) -> dict[str, Any]:
    context = get_runtime_context()
    resolved = dict(kwargs)
    resolved.setdefault("cwd", context.workdir)
    resolved.setdefault("env", context.env())
    return resolved


def run(*popenargs: Any, **kwargs: Any) -> CompletedProcess[Any]:
    """Run a subprocess with ATaC runtime cwd/env defaults."""
    return _subprocess.run(*popenargs, **_inject_defaults(kwargs))


class Popen(_subprocess.Popen[Any]):
    """Popen variant that defaults cwd/env from the runtime context."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **_inject_defaults(kwargs))


def call(*popenargs: Any, **kwargs: Any) -> int:
    """Call a subprocess with ATaC runtime cwd/env defaults."""
    return _subprocess.call(*popenargs, **_inject_defaults(kwargs))


def check_call(*popenargs: Any, **kwargs: Any) -> int:
    """Run a subprocess and raise on failure with ATaC defaults."""
    return _subprocess.check_call(*popenargs, **_inject_defaults(kwargs))


def check_output(*popenargs: Any, **kwargs: Any) -> Any:
    """Capture subprocess output with ATaC runtime cwd/env defaults."""
    return _subprocess.check_output(*popenargs, **_inject_defaults(kwargs))
