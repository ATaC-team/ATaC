from pathlib import Path

from atac.audit import analyze_graph_file, analyze_graph_spec


def test_analyze_graph_file_extracts_auditable_structure(tmp_path):
    graph_file = tmp_path / "graph_module.py"
    graph_file.write_text(
        "from langgraph.graph import END, START, StateGraph\n"
        "from atac import get_service\n"
        "\n"
        "class GraphState(dict):\n"
        "    pass\n"
        "\n"
        "def prepare(state):\n"
        "    return {'q': state['q']}\n"
        "\n"
        "def query(state):\n"
        "    return {'rows': get_service().tool_call('execute_query', {'entity_name': 'routes'})}\n"
        "\n"
        "async def analyze(state):\n"
        "    agent = get_service().get_agent('planner')\n"
        "    return await agent.ainvoke({'question': state['q']})\n"
        "\n"
        "def build_graph():\n"
        "    graph = StateGraph(GraphState)\n"
        "    graph.add_node('prepare', prepare)\n"
        "    graph.add_node('query', query)\n"
        "    graph.add_node('analyze', analyze)\n"
        "    graph.add_edge(START, 'prepare')\n"
        "    graph.add_edge('prepare', 'query')\n"
        "    graph.add_edge('query', 'analyze')\n"
        "    graph.add_edge('analyze', END)\n"
        "    return graph.compile()\n",
        encoding="utf-8",
    )

    audit = analyze_graph_file(graph_file, entrypoint="build_graph")

    assert audit["entrypoint"] == "build_graph"
    assert audit["state_schema"] == "GraphState"
    assert audit["edges"] == [
        {"source": "__start__", "target": "prepare"},
        {"source": "prepare", "target": "query"},
        {"source": "query", "target": "analyze"},
        {"source": "analyze", "target": "__end__"},
    ]

    nodes = {node["id"]: node for node in audit["nodes"]}
    assert nodes["prepare"]["kind"] == "logic"
    assert nodes["query"]["kind"] == "tool"
    assert nodes["query"]["tool_calls"] == [
        {"tool_name": "execute_query", "line": 11, "arg_keys": ["entity_name"]}
    ]
    assert nodes["analyze"]["kind"] == "agent"
    assert nodes["analyze"]["is_async"] is True
    assert nodes["analyze"]["agent_calls"] == [{"agent_name": "planner", "line": 14}]


def test_analyze_graph_spec_resolves_module_source(tmp_path, monkeypatch):
    pkg_dir = tmp_path / "auditpkg"
    pkg_dir.mkdir()
    (pkg_dir / "__init__.py").write_text("", encoding="utf-8")
    graph_file = pkg_dir / "graph_module.py"
    graph_file.write_text(
        "from langgraph.graph import END, START, StateGraph\n"
        "def step(state):\n"
        "    return state\n"
        "def build_graph():\n"
        "    graph = StateGraph(dict)\n"
        "    graph.add_node('step', step)\n"
        "    graph.add_edge(START, 'step')\n"
        "    graph.add_edge('step', END)\n"
        "    return graph.compile()\n",
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(tmp_path))

    audit = analyze_graph_spec("auditpkg.graph_module:build_graph")

    assert audit["graph_spec"] == "auditpkg.graph_module:build_graph"
    assert Path(audit["source_path"]) == graph_file.resolve()
    assert [node["id"] for node in audit["nodes"]] == ["step"]
