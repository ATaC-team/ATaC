"""LangGraph graph example with branching and looping via AtacService.tool_call()."""

from __future__ import annotations

from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from atac import get_service


class DemoState(TypedDict, total=False):
    who: str
    max_attempts: int
    attempt: int
    bash_output: str
    mcp_output: str
    history: list[str]
    done: bool

def prepare(state: DemoState) -> DemoState:
    """Initialize loop state before executing tool calls."""
    return {
        "who": state.get("who", "world"),
        "max_attempts": int(state.get("max_attempts", 2)),
        "attempt": int(state.get("attempt", 0)),
        "history": list(state.get("history", [])),
        "done": bool(state.get("done", False)),
    }


def should_start(state: DemoState) -> str:
    """Skip execution when the caller provides an empty subject."""
    if not state.get("who"):
        return "finish"
    return "run_bash"


def run_bash(state: DemoState) -> DemoState:
    """Call the atac-registered bash tool from a graph node."""
    who = state.get("who", "world")
    attempt = int(state.get("attempt", 0))
    bash_output = get_service().tool_call(
        "bash",
        {"command": f"printf 'langgraph:{who}:attempt-{attempt + 1}'"},
    )
    history = list(state.get("history", []))
    history.append(str(bash_output))
    return {
        "who": who,
        "attempt": attempt + 1,
        "bash_output": str(bash_output),
        "history": history,
    }


def run_mcp_echo(state: DemoState) -> DemoState:
    """Call the atac-registered MCP echo tool from a graph node."""
    mcp_output = get_service().tool_call(
        "echo",
        {"text": state["bash_output"]},
    )
    return {
        "mcp_output": str(mcp_output),
    }


def should_continue(state: DemoState) -> str:
    """Loop until the configured attempt limit is reached."""
    attempt = int(state.get("attempt", 0))
    max_attempts = int(state.get("max_attempts", 1))
    if attempt < max_attempts:
        return "run_bash"
    return "finish"


def finish(state: DemoState) -> DemoState:
    """Mark the graph as complete."""
    return {
        "done": True,
    }


def build_graph():
    """Build a graph with a conditional start and a tool-call loop."""
    graph = StateGraph(DemoState)
    graph.add_node("prepare", prepare)
    graph.add_node("run_bash", run_bash)
    graph.add_node("run_mcp_echo", run_mcp_echo)
    graph.add_node("finish", finish)
    graph.add_edge(START, "prepare")
    graph.add_conditional_edges(
        "prepare",
        should_start,
        {
            "run_bash": "run_bash",
            "finish": "finish",
        },
    )
    graph.add_edge("run_bash", "run_mcp_echo")
    graph.add_conditional_edges(
        "run_mcp_echo",
        should_continue,
        {
            "run_bash": "run_bash",
            "finish": "finish",
        },
    )
    graph.add_edge("finish", END)
    return graph.compile()


if __name__ == "__main__":
    app = build_graph()
    print(app.invoke({"who": "mob", "max_attempts": 3}))
