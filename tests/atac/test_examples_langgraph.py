from __future__ import annotations

import json

from tests.atac.examples_langgraph_bootstrap import get_service


def test_examples_langgraph_bootstrap_and_run():
    service = get_service()
    assert "echo" in service.list_tools()
    assert "upper" in service.list_tools()
    assert "json_pack" in service.list_tools()

    assert service.tool_call("echo", {"text": "hello"}) == "hello"
    assert service.tool_call("upper", {"text": "hello"}) == "HELLO"
    payload = json.loads(
        service.tool_call(
            "json_pack",
            {"name": "mob", "city": "hangzhou"},
        )
    )
    assert payload["name"] == "mob"
    assert payload["city"] == "hangzhou"
