<div align="center">

<img src="assets/logo.svg" alt="ATaC Logo" width="500"/>

[![PyPI version](https://img.shields.io/pypi/v/atac?color=blue&logo=pypi&logoColor=white)](https://pypi.org/project/atac/)
[![Python versions](https://img.shields.io/pypi/pyversions/atac?logo=python&logoColor=white)](https://pypi.org/project/atac/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI Status](https://github.com/ATaC-team/ATaC/actions/workflows/cd.yml/badge.svg)](https://github.com/ATaC-team/ATaC/actions)

[English](#english) | [中文](#中文)

</div>

## 中文

ATaC是一个面向 Agent 工作流的工具运行时，帮助 Agent 通过编排图代码复用资产。

它主要提供三类能力：

- 统一工具注册：把本地 Agent 工具和 MCP 工具纳入同一个运行时
- Agent 自编排 graph：让 Agent 生成的 graph 代码可以直接复用这些已注册能力
- 一键运行：加载并执行这些 graph 工作流

把工具注册到 ATaC，让 Agent 用代码把这些工具组织成流程，并逐步沉淀为可复用、可维护的 graph 工作流。

### 🤖 最小接入示例

#### 1. 注册 Agent 内置工具和 MCP 工具

```python
import asyncio
import inspect
import sys
from pathlib import Path

from atac import AtacService
import atac.subprocess as subprocess
from langchain_core.tools import tool
from langchain_mcp_adapters.client import MultiServerMCPClient

service = AtacService()


@tool
def bash(command: str) -> str:
    """在当前运行目录里执行 shell 命令。"""
    completed = subprocess.run(
        command,
        shell=True,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "bash failed")
    return completed.stdout.rstrip("\n")

service.register_langgraph_tools([bash])

client = MultiServerMCPClient(
    {
        "demo_mcp": {
            "transport": "stdio",
            "command": sys.executable,
            "args": [str(Path("simple_mcp_server.py").resolve())],
        }
    }
)

mcp_tools = client.get_tools()
if inspect.isawaitable(mcp_tools):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        mcp_tools = asyncio.run(mcp_tools)
    else:
        raise RuntimeError("在异步上下文里请先 await client.get_tools() 再注册")

mcp_tools = list(mcp_tools)
service.register_langgraph_tools(mcp_tools)


def get_service() -> AtacService:
    return service
```

推荐做法：

- 本地工具直接使用原生 `langchain_core.tools.tool`
- MCP 工具直接使用官方 `langchain_mcp_adapters.client.MultiServerMCPClient`
- 统一通过 `service.register_langgraph_tools(...)` 注册到 `AtacService`

#### 2. 在 graph 代码里调用 ATaC SDK

```python
from langgraph.graph import START, END, StateGraph

from atac import get_service


def run_bash(state: dict) -> dict:
    output = get_service().tool_call("bash", {"command": f"echo {state['who']}"})
    return {"output": output}


def build_graph():
    graph = StateGraph(dict)
    graph.add_node("run_bash", run_bash)
    graph.add_edge(START, "run_bash")
    graph.add_edge("run_bash", END)
    return graph.compile()
```

### 🚀 快速开始

#### 1. 安装

```bash
uv tool install atac
```

#### 2. Python SDK

```python
from myapp.bootstrap import get_service

service = get_service()
result = service.run_graph("myapp.graphs:build_graph", {"who": "mob"})
```

#### 3. 示例

- [bootstrap.py](/Users/mob/ATaC/example/demo/bootstrap.py)
- [tool_call_graph.py](/Users/mob/ATaC/example/langgraph/tool_call_graph.py)
- [agent_workflow.py](/Users/mob/ATaC/example/langgraph/agent_workflow.py)
- [run_graph_demo.sh](/Users/mob/ATaC/example/langgraph/run_graph_demo.sh)
- [run_graph_sdk.py](/Users/mob/ATaC/example/langgraph/run_graph_sdk.py)

---

## English

ATaC is a tool runtime for agent workflows.

It provides three core capabilities:

- unified tool registration
- agent-authored graph workflows that reuse registered tools
- one-command graph execution

Register tools with ATaC, let agents organize them into workflows as code, and gradually turn repeated tasks into reusable, maintainable graph workflows.

### 🤖 Minimal Integration

#### 1. Register Built-In and MCP Tools

```python
import asyncio
import inspect
import sys
from pathlib import Path

from atac import AtacService
import atac.subprocess as subprocess
from langchain_core.tools import tool
from langchain_mcp_adapters.client import MultiServerMCPClient

service = AtacService()


@tool
def bash(command: str) -> str:
    """Run a shell command inside the current runtime workdir."""
    completed = subprocess.run(
        command,
        shell=True,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "bash failed")
    return completed.stdout.rstrip("\n")

service.register_langgraph_tools([bash])

client = MultiServerMCPClient(
    {
        "demo_mcp": {
            "transport": "stdio",
            "command": sys.executable,
            "args": [str(Path("simple_mcp_server.py").resolve())],
        }
    }
)

mcp_tools = client.get_tools()
if inspect.isawaitable(mcp_tools):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        mcp_tools = asyncio.run(mcp_tools)
    else:
        raise RuntimeError("Await client.get_tools() before registering in async code.")

mcp_tools = list(mcp_tools)
service.register_langgraph_tools(mcp_tools)


def get_service() -> AtacService:
    return service
```

Recommended path:

- use the native `langchain_core.tools.tool` decorator for local tools
- use the official `langchain_mcp_adapters.client.MultiServerMCPClient` for MCP tools
- register everything through `service.register_langgraph_tools(...)`

#### 2. Call the ATaC SDK from Graph Code

```python
from langgraph.graph import START, END, StateGraph

from atac import get_service


def run_bash(state: dict) -> dict:
    output = get_service().tool_call("bash", {"command": f"echo {state['who']}"})
    return {"output": output}


def build_graph():
    graph = StateGraph(dict)
    graph.add_node("run_bash", run_bash)
    graph.add_edge(START, "run_bash")
    graph.add_edge("run_bash", END)
    return graph.compile()
```

### 🚀 Quick Start

#### 1. Install

```bash
uv tool install atac
```

#### 2. Run via Python SDK

```python
from myapp.bootstrap import get_service

service = get_service()
result = service.run_graph("myapp.graphs:build_graph", {"who": "mob"})
```

#### 3. Examples

- [bootstrap.py](/Users/mob/ATaC/example/demo/bootstrap.py)
- [tool_call_graph.py](/Users/mob/ATaC/example/langgraph/tool_call_graph.py)
- [agent_workflow.py](/Users/mob/ATaC/example/langgraph/agent_workflow.py)
- [run_graph_demo.sh](/Users/mob/ATaC/example/langgraph/run_graph_demo.sh)
- [run_graph_sdk.py](/Users/mob/ATaC/example/langgraph/run_graph_sdk.py)
