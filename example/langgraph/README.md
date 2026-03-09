# LangGraph Examples

These examples use LangGraph for orchestration and `atac` for tool registration
and `tool_call(...)`.

## Files

```text
example/langgraph/
  bootstrap.py
  tool_call_graph.py
  agent_workflow.py
  run_graph_demo.sh
```

`bootstrap.py` reuses the shared service setup from
[example/demo/bootstrap.py](/Users/mob/ATaC/example/demo/bootstrap.py), so the
LangGraph examples can use the same `bash` and `echo` tools.

## Run

Run the direct graph orchestration example:

```bash
sh example/langgraph/run_graph_demo.sh mob 3
```

This expands to:

```bash
uv run python3 -m atac.cli.main graph example.langgraph.tool_call_graph:build_graph \
  --bootstrap example.langgraph.bootstrap:get_service \
  --input who=mob \
  --input max_attempts=3
```

Run the same graph through the Python SDK:

```bash
uv run python3 example/langgraph/run_graph_sdk.py
```

The agent-routed workflow in
[agent_workflow.py](/Users/mob/ATaC/example/langgraph/agent_workflow.py)
expects a model object, so use it from Python with a wrapper that binds the model first.

```python
from example.langgraph.agent_workflow import build_agent_workflow

app = build_agent_workflow(model)
result = app.invoke({"who": "mob", "max_attempts": 2})
```

`atac graph` binds the service before importing the graph module, so graph code can
call `from atac import get_service` and then use `get_service().tool_call(...)`
inside nodes without manually wiring the service object.
