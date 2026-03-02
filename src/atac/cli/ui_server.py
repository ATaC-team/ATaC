import json
import os
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="ATaC UI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RunRequest(BaseModel):
    yamlContent: str
    mcpConfigPath: str | list[str] | None = None

@app.get("/api/config")
async def get_config() -> dict[str, Any]:
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

    return {
        "workspaceDir": workspace_dir,
        "mcpConfigPath": mcp_config_path
    }

@app.get("/api/workspace")
async def get_workspace(path: str) -> dict[str, Any]:
    if not path:
        raise HTTPException(status_code=400, detail="path is required")
        
    target = Path(path)
    
    if not target.exists():
        raise HTTPException(status_code=400, detail=f"Path '{path}' does not exist")
        
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
            return {"type": "directory", "files": files}
        elif target.is_file() and target.suffix in [".yaml", ".yml", ".json"]:
            return {
                "type": "file",
                "files": [{
                    "name": target.name,
                    "path": str(target),
                    "content": target.read_text(encoding="utf-8")
                }]
            }
        else:
            raise HTTPException(status_code=400, detail="Not a valid directory, YAML, or JSON file")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/run")
async def run_trajectory(req: RunRequest) -> dict[str, Any]:
    env = os.environ.copy()
    
    if req.mcpConfigPath:
        if isinstance(req.mcpConfigPath, list):
            env["ATAC_MCP_SERVER_CONFIGS"] = ",".join(req.mcpConfigPath)
        elif isinstance(req.mcpConfigPath, str) and req.mcpConfigPath.strip():
            env["ATAC_MCP_SERVER_CONFIGS"] = req.mcpConfigPath.strip()
            
    print("[ATaC Backend Python] Running trajectory via stdin", flush=True)

    try:
        proc = subprocess.run(
            [sys.executable, "-m", "atac.cli.main", "run", "-"],
            input=req.yamlContent.encode("utf-8"),
            capture_output=True,
            env=env
        )
        
        output = proc.stdout.decode("utf-8") + proc.stderr.decode("utf-8")
        print(f"[ATaC Backend Python] Trajectory finished with code {proc.returncode}", flush=True)
        return {"output": output, "exitCode": proc.returncode}
    except Exception as e:
        print(f"[ATaC Backend Python] Spawn error: {e}", file=sys.stderr)
        raise HTTPException(status_code=500, detail=f"Failed to start atac process: {str(e)}")

static_dir = Path(__file__).parent.parent / "ui_static"
if static_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(static_dir / "assets")), name="assets")

@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    # Try to serve a specific static file if it exists, otherwise return index.html for SPA frontend routing
    if not static_dir.exists():
        return JSONResponse(status_code=404, content={"error": "UI static files not found. Ensure ATaC is properly built."})
        
    file_path = static_dir / full_path
    if file_path.exists() and file_path.is_file():
        return FileResponse(file_path)
    
    index_file = static_dir / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
        
    return JSONResponse(status_code=404, content={"error": "index.html not found"})

def start_server(port: int, open_browser: bool = True):
    # Dynamically find an open port starting from `port` to avoid address conflicts
    import socket
    def find_free_port(p):
        for port_try in range(p, p + 100):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                try:
                    s.bind(("127.0.0.1", port_try))
                    return port_try
                except OSError:
                    pass
        return p  # Fallback
        
    final_port = find_free_port(port)
    url = f"http://localhost:{final_port}"
    print(f"[ATaC UI] FastAPI backend starting on {url}")

    if open_browser:
        def open_browser_func():
            time.sleep(1.0)
            webbrowser.open(url)
        threading.Thread(target=open_browser_func, daemon=True).start()

    # Disable typical loud uvicorn access logging for a cleaner CLI
    uvicorn.run(app, host="127.0.0.1", port=final_port, log_level="warning")
