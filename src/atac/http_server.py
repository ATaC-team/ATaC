"""HTTP server factory for ATaC service."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

from atac.service import AtacService


class GraphRunRequest(BaseModel):
    graph_spec: str
    state: dict[str, Any] | None = Field(default=None)


class ToolCallRequest(BaseModel):
    tool_name: str
    args: dict[str, Any] | None = Field(default=None)


class HealthResponse(BaseModel):
    ok: bool
    tools: list[str]


def create_app(service: AtacService) -> FastAPI:
    app = FastAPI(title="ATaC Service", version="1.0.0")

    @app.get("/health")
    def health() -> HealthResponse:
        return HealthResponse(
            ok=True,
            tools=service.list_tools(),
        )

    @app.post("/v1/graph")
    def run_graph(payload: GraphRunRequest) -> dict[str, Any]:
        return {
            "ok": True,
            "graph": payload.graph_spec,
            "result": service.run_graph(payload.graph_spec, payload.state or {}),
        }

    @app.post("/v1/tool-call")
    def tool_call(payload: ToolCallRequest) -> dict[str, Any]:
        return {
            "ok": True,
            "tool": payload.tool_name,
            "result": service.tool_call(payload.tool_name, payload.args or {}),
        }

    return app
