from typing import Literal

from pydantic import BaseModel


class ParsedAction(BaseModel):
    """Structured data parsed from an action URL."""
    scheme: Literal["mcp", "bash"]
    server_or_cmd: str
    method: str
    query_params: dict[str, str]
