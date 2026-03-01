import json
import os
import subprocess
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse


class ATaCUIHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Serve static files from the `ui_static` directory
        static_dir = Path(__file__).parent.parent / "ui_static"
        super().__init__(*args, directory=str(static_dir), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/config':
            self._handle_api_config()
        elif parsed.path == '/api/workspace':
            self._handle_api_workspace(parsed.query)
        else:
            # SPA fallback: if file does not exist, return index.html
            requested = Path(self.directory) / parsed.path.lstrip('/')
            if not requested.exists() and not parsed.path.startswith('/api/'):
                self.path = '/index.html'
            super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/run':
            self._handle_api_run()
        else:
            self.send_error(404, "Not Found")

    def _send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def _handle_api_config(self):
        workspace_dir = os.environ.get("ATAC_WORKSPACE_DIR", "")
        mcp_config_path = ""

        if workspace_dir:
            config_path = Path(workspace_dir) / ".atac" / "atac.json"
            if config_path.exists():
                try:
                    config = json.loads(config_path.read_text(encoding="utf-8"))
                    mcp_config_path = config.get("mcp_config", "")
                except Exception as e:
                    print(f"[ATaC Backend] Failed to parse atac.json: {e}", file=sys.stderr)

        self._send_json({
            "workspaceDir": workspace_dir,
            "mcpConfigPath": mcp_config_path
        })

    def _handle_api_workspace(self, query):
        qs = parse_qs(query)
        target_path_list = qs.get("path", [])
        if not target_path_list:
            return self._send_json({"error": "path is required"}, 400)
            
        target_path = target_path_list[0]
        target = Path(target_path)
        
        if not target.exists():
            return self._send_json({"error": f"Path '{target_path}' does not exist"}, 400)
            
        try:
            if target.is_dir():
                files = []
                for entry in target.iterdir():
                    if entry.is_file() and entry.suffix in [".yaml", ".yml"]:
                        files.append({
                            "name": entry.name,
                            "path": str(entry),
                            "content": entry.read_text(encoding="utf-8")
                        })
                    elif entry.is_dir():
                        for idx_name in ["index.yaml", "index.yml", "index.json"]:
                            idx_path = entry / idx_name
                            if idx_path.exists():
                                files.append({
                                    "name": entry.name,
                                    "path": str(idx_path),
                                    "content": idx_path.read_text(encoding="utf-8")
                                })
                                break
                self._send_json({"type": "directory", "files": files})
            elif target.is_file() and target.suffix in [".yaml", ".yml", ".json"]:
                self._send_json({
                    "type": "file",
                    "files": [{
                        "name": target.name,
                        "path": str(target),
                        "content": target.read_text(encoding="utf-8")
                    }]
                })
            else:
                self._send_json({"error": "Not a valid directory, YAML, or JSON file"}, 400)
        except Exception as e:
            self._send_json({"error": str(e)}, 500)

    def _handle_api_run(self):
        content_length_str = self.headers.get('Content-Length')
        if not content_length_str:
            return self._send_json({"error": "Content-Length required"}, 400)
            
        content_length = int(content_length_str)
        body = self.rfile.read(content_length)
        if not body:
            return self._send_json({"error": "Request body forms empty"}, 400)
            
        try:
            req_data = json.loads(body.decode("utf-8"))
        except Exception as e:
            return self._send_json({"error": f"Invalid JSON: {str(e)}"}, 400)
            
        yaml_content = req_data.get("yamlContent")
        if not yaml_content:
            return self._send_json({"error": "yamlContent is required"}, 400)
            
        mcp_config = req_data.get("mcpConfigPath")
        env = os.environ.copy()
        
        if mcp_config:
            if isinstance(mcp_config, list):
                env["ATAC_MCP_SERVER_CONFIGS"] = ",".join(mcp_config)
            elif isinstance(mcp_config, str) and mcp_config.strip():
                env["ATAC_MCP_SERVER_CONFIGS"] = mcp_config.strip()
                
        print("[ATaC Backend Python] Running trajectory via stdin", flush=True)

        try:
            # We use 'atac run -' assuming 'atac' script is in PATH
            # If it's not strictly reliable, we might want to invoke it as [sys.executable, "-m", "atac.cli.main", "run", "-"]
            proc = subprocess.run(
                [sys.executable, "-m", "atac.cli.main", "run", "-"],
                input=yaml_content.encode("utf-8"),
                capture_output=True,
                env=env
            )
            
            output = proc.stdout.decode("utf-8") + proc.stderr.decode("utf-8")
            print(f"[ATaC Backend Python] Trajectory finished with code {proc.returncode}", flush=True)
            self._send_json({"output": output, "exitCode": proc.returncode})
        except Exception as e:
            print(f"[ATaC Backend Python] Spawn error: {e}", file=sys.stderr)
            self._send_json({"error": f"Failed to start atac process: {str(e)}"}, 500)

    # Disable excessive logging locally if needed
    def log_message(self, format, *args):
        pass

def start_server(port, open_browser=True):
    while True:
        try:
            server = HTTPServer(("localhost", port), ATaCUIHandler)
            url = f"http://localhost:{port}"
            print(f"[ATaC UI] Python backend listening on {url}")
            if open_browser:
                # Slightly delayed browser opening to allow server start
                import threading
                import webbrowser
                def open_browser_func():
                    import time
                    time.sleep(0.5)
                    webbrowser.open(url)
                threading.Thread(target=open_browser_func, daemon=True).start()
            server.serve_forever()
        except OSError as e:
            if getattr(e, "errno", None) == 48 or "Address already in use" in str(e):
                port += 1
            else:
                raise
