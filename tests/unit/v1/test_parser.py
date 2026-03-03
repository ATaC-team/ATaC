import pytest

from atac.runtimes.v1.parser import ActionParser


def test_parse_mcp_action():
    parsed = ActionParser.parse("mcp://google/search")
    assert parsed.scheme == "mcp"
    assert parsed.server_or_cmd == "google"
    assert parsed.method == "search"
    assert parsed.query_params == {}


def test_parse_mcp_action_with_query():
    parsed = ActionParser.parse("mcp://weather/get_forecast?city=Beijing&days=3")
    assert parsed.scheme == "mcp"
    assert parsed.server_or_cmd == "weather"
    assert parsed.method == "get_forecast"
    assert parsed.query_params == {"city": "Beijing", "days": "3"}


def test_parse_bash_action():
    parsed = ActionParser.parse("bash://run")
    assert parsed.scheme == "bash"
    assert parsed.server_or_cmd == "run"
    assert parsed.method == ""
    assert parsed.query_params == {}


def test_unsupported_scheme():
    with pytest.raises(ValueError, match="Unsupported action scheme"):
        ActionParser.parse("http://example.com/api")
