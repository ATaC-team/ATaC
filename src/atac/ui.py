"""Static audit UI launcher."""

from __future__ import annotations

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from importlib import resources
from pathlib import Path
from typing import Protocol

import click


class _Traversable(Protocol):
    def joinpath(self, *descendants: str) -> "_Traversable": ...
    def is_file(self) -> bool: ...


class _QuietStaticHandler(SimpleHTTPRequestHandler):
    """Serve packaged UI assets without noisy request logging."""

    def log_message(self, format: str, *args: object) -> None:  # noqa: A003
        _ = (format, args)


def get_ui_dist_resource() -> _Traversable:
    """Return the packaged audit UI distribution resource."""
    ui_root = resources.files("atac").joinpath("ui_dist")
    index_path = ui_root.joinpath("index.html")
    if not index_path.is_file():
        raise FileNotFoundError(
            "Packaged ATaC UI assets are missing. Reinstall atac or rebuild the audit UI bundle.",
        )
    return ui_root


def serve_ui(host: str = "127.0.0.1", port: int = 4173, *, open_browser: bool = True) -> None:
    """Serve the packaged audit UI and optionally open it in the browser."""
    ui_root = get_ui_dist_resource()
    with resources.as_file(ui_root) as dist_dir:
        handler = partial(_QuietStaticHandler, directory=str(Path(dist_dir)))

        with ThreadingHTTPServer((host, port), handler) as httpd:
            actual_port = int(httpd.server_address[1])
            browser_host = "127.0.0.1" if host in {"0.0.0.0", "::"} else host
            url = f"http://{browser_host}:{actual_port}"
            click.echo(f"ATaC UI starting on {url}")
            click.echo("Press Ctrl+C to stop.")
            if open_browser:
                click.launch(url)
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                click.echo("ATaC UI stopped.")
