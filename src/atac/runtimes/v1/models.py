from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

DataType = Literal["string", "integer", "boolean", "float", "list", "object"]

class ParsedAction(BaseModel):
    """Structured data parsed from an action URL."""
    scheme: Literal["mcp", "bash", "kimi"]
    server_or_cmd: str
    method: str
    query_params: dict[str, str]

class InputDef(BaseModel):
    name: str
    type: DataType
    default: Any | None = None

class VariableDef(BaseModel):
    name: str
    type: DataType
    value: Any | None = None

class BaseStep(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str | None = None
    timeout: int | str | None = None
    if_condition: str | None = Field(default=None, alias="if")

class ActionStep(BaseStep):
    type: Literal["action"] = "action"
    action: str
    args: dict[str, Any] | None = None
    output_to: str | None = None

class SetStep(BaseStep):
    type: Literal["set"] = "set"
    variables: dict[str, Any]

class IfStep(BaseStep):
    type: Literal["if"] = "if"
    condition: str
    then: list["Step"]
    else_: list["Step"] | None = Field(default=None, alias="else")

class ForStep(BaseStep):
    type: Literal["for"] = "for"
    in_: str = Field(alias="in")
    item: str
    steps: list["Step"]

Step = ActionStep | SetStep | IfStep | ForStep

class MetaDef(BaseModel):
    name: str | None = None
    description: str | None = None
    author: str | None = None

class Trajectory(BaseModel):
    version: Literal["1.0"]
    meta: MetaDef | None = None
    inputs: list[InputDef] = Field(default_factory=list)
    variables: list[VariableDef] = Field(default_factory=list)
    steps: list[Step]
