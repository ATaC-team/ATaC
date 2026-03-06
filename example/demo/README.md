# Demo Bootstrap

This directory keeps the shared bootstrap used by the LangGraph examples:

- module-level `service`
- module-level LangGraph `bash` tool registration using `atac.subprocess`
- module-level MCP registration
- `create_agent(model)` for users who still want a prebuilt LangGraph agent

## Files

```text
example/demo/
  bootstrap.py
  simple_mcp_server.py
```

For graph-first usage, see
[example/langgraph/README.md](/Users/mob/ATaC/example/langgraph/README.md).
