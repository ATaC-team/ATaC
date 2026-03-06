"""Run a LangGraph example directly through the ATaC Python service API."""

from __future__ import annotations

from example.langgraph.bootstrap import get_service


def main() -> None:
    service = get_service()
    result = service.run_graph(
        "example.langgraph.tool_call_graph:build_graph",
        {
            "who": "mob",
            "max_attempts": 3,
        },
    )
    print(result)


if __name__ == "__main__":
    main()
