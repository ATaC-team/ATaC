"""Test-only LangGraph bootstrap fixture for ATaC."""

from __future__ import annotations

import json

from atac import set_service
from atac.service import AtacService
from atac.wrapper.langgraph import tool


def get_service() -> AtacService:
    """Build a service with a few LangGraph-backed test tools."""
    service = AtacService()
    set_service(service)
    
    @tool(name="echo")
    def echo_tool(text: str) -> str:
        """Echo input text."""  
        return text

    @tool(name="upper")
    def upper_tool(text: str) -> str:
        """Upper-case input text."""
        return text.upper()

    @tool(name="json_pack")
    def json_pack_tool(name: str, city: str) -> str:
        """Build a JSON string payload."""
        return json.dumps(
            {"name": name, "city": city, "source": "tests.langgraph"},
            ensure_ascii=False,
        )

    return service
