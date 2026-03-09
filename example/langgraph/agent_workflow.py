"""LangGraph workflow example with an agent decision node and atac tool calls."""

from __future__ import annotations

from typing import Literal, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

from atac import get_service


class WorkflowState(TypedDict, total=False):
    who: str
    max_attempts: int
    attempt: int
    bash_output: str
    mcp_output: str
    done: bool
    reason: str
    _next_step: str


class AgentDecision(BaseModel):
    """Structured routing output for the agent node."""

    next_step: Literal["run_bash", "run_mcp_echo", "finish"] = Field(
        description="Which graph node should run next."
    )
    reason: str = Field(description="Why this step should run next.")


def prepare(state: WorkflowState) -> WorkflowState:
    """Initialize defaults before the agent starts routing."""
    return {
        "who": state.get("who", "world"),
        "max_attempts": int(state.get("max_attempts", 2)),
        "attempt": int(state.get("attempt", 0)),
        "done": bool(state.get("done", False)),
    }


def agent_decide(state: WorkflowState, model) -> WorkflowState:
    """Ask the model which tool-oriented step should run next."""
    structured_model = model.with_structured_output(AgentDecision)
    decision = structured_model.invoke(
        [
            SystemMessage(
                content=(
                    "You are routing a LangGraph workflow. "
                    "Choose exactly one next step: "
                    "run_bash, run_mcp_echo, or finish."
                )
            ),
            HumanMessage(
                content=(
                    f"Current state:\n"
                    f"- who: {state.get('who', 'world')}\n"
                    f"- attempt: {state.get('attempt', 0)}\n"
                    f"- max_attempts: {state.get('max_attempts', 2)}\n"
                    f"- bash_output: {state.get('bash_output', '')}\n"
                    f"- mcp_output: {state.get('mcp_output', '')}\n"
                    "Route rules:\n"
                    "1. If no bash_output exists yet, choose run_bash.\n"
                    "2. If bash_output exists and no mcp_output exists yet, choose run_mcp_echo.\n"
                    "3. If attempt is below max_attempts after mcp_output exists, choose run_bash.\n"
                    "4. Otherwise choose finish."
                )
            ),
        ]
    )
    return {
        "reason": decision.reason,
        "_next_step": decision.next_step,
    }


def run_bash(state: WorkflowState) -> WorkflowState:
    """Execute an atac-managed bash tool."""
    attempt = int(state.get("attempt", 0)) + 1
    who = state.get("who", "world")
    bash_output = get_service().tool_call(
        "bash",
        {"command": f"printf 'agent:{who}:attempt-{attempt}'"},
    )
    return {
        "attempt": attempt,
        "bash_output": str(bash_output),
        "mcp_output": "",
    }


def run_mcp_echo(state: WorkflowState) -> WorkflowState:
    """Execute an atac-managed MCP tool."""
    mcp_output = get_service().tool_call(
        "echo",
        {"text": state["bash_output"]},
    )
    return {
        "mcp_output": str(mcp_output),
    }


def finish(state: WorkflowState) -> WorkflowState:
    """Mark the workflow complete."""
    return {
        "done": True,
    }


def route_after_agent(state: WorkflowState) -> str:
    """Read the agent's chosen next step from state."""
    return str(state["_next_step"])


def build_agent_workflow(model):
    """Build a workflow where the model decides which tool node runs next."""
    graph = StateGraph(WorkflowState)
    graph.add_node("prepare", prepare)
    graph.add_node("agent_decide", lambda state: agent_decide(state, model))
    graph.add_node("run_bash", run_bash)
    graph.add_node("run_mcp_echo", run_mcp_echo)
    graph.add_node("finish", finish)

    graph.add_edge(START, "prepare")
    graph.add_edge("prepare", "agent_decide")
    graph.add_conditional_edges(
        "agent_decide",
        route_after_agent,
        {
            "run_bash": "run_bash",
            "run_mcp_echo": "run_mcp_echo",
            "finish": "finish",
        },
    )
    graph.add_edge("run_bash", "agent_decide")
    graph.add_edge("run_mcp_echo", "agent_decide")
    graph.add_edge("finish", END)
    return graph.compile()
