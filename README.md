<div align="center">

<img src="assets/logo.svg" alt="ATaC Logo" width="500"/>

[![PyPI version](https://img.shields.io/pypi/v/atac?color=blue&logo=pypi&logoColor=white)](https://pypi.org/project/atac/)
[![Python versions](https://img.shields.io/pypi/pyversions/atac?logo=python&logoColor=white)](https://pypi.org/project/atac/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI Status](https://github.com/ATaC-team/ATaC/actions/workflows/cd.yml/badge.svg)](https://github.com/ATaC-team/ATaC/actions)

[English](#english) | [中文](#中文)

</div>

## 中文

ATaC 1.0.0 是一个面向 Agent 工作流的工具运行时，帮助 Agent 通过编排图代码复用资产。

它主要提供三类能力：

- 工具注册：统一注册 Agent 内置工具和 MCP 工具
- 工具调用：在 graph 节点里通过 `tool_call(...)` 按名字调用工具
- Python SDK：让 Agent 在 graph 代码里直接调用已注册工具

你可以把常用能力沉淀为已注册工具，再在新的图里直接复用它们，把任务经验持续积累成可维护的工作流代码。

### 🛠 核心能力

- **Agent 工具注册**：把 Agent 内置工具统一注册到 `AtacService`。
- **MCP 工具注册**：把外部 MCP 工具接入同一套工具空间中复用。
- **图代码调用 SDK**：在 graph 节点里直接使用 `get_service().tool_call(...)`。
- **资产复用导向**：Agent 通过编排图代码，把已有工具资产重新组织成新的工作流。
- **LangGraph 编排友好**：直接在 LangGraph graph 代码中组合和复用这些工具资产。

### 🤖 最小接入示例

#### 1. 注册 Agent 内置工具

```python
from atac import AtacService, set_service
from atac.wrapper.langgraph import tool
import atac.subprocess as subprocess

service = AtacService()
set_service(service)


@tool(name="bash")
def bash_tool(command: str) -> str:
    completed = subprocess.run(
        command,
        shell=True,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "bash failed")
    return completed.stdout.rstrip("\n")


def get_service() -> AtacService:
    return service
```

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

ATaC 1.0.0 is a tool runtime for agent workflows, helping agents reuse assets through graph-based workflow code.

It focuses on:

- built-in agent tool registration
- MCP tool registration
- named tool invocation from graph nodes
- a Python SDK for calling registered tools from graph code

You can keep reusable capabilities behind registered tools, then compose new workflows by calling those assets directly from graph code.

### 🛠 Key Features

- **Built-In Agent Tool Registration**: Register agent-native tools on `AtacService`.
- **MCP Tool Registration**: Bring external MCP tools into the same reusable tool space.
- **SDK Calls from Graph Code**: Graph nodes can call `get_service().tool_call(...)`.
- **Asset Reuse Through Graphs**: Agents build new workflows by composing graph code around existing registered tool assets.
- **LangGraph-Friendly Composition**: Reuse those assets directly inside LangGraph workflow code.

### 🤖 Minimal Integration

#### 1. Register Built-In Agent Tools

```python
from atac import AtacService, set_service
from atac.wrapper.langgraph import tool
import atac.subprocess as subprocess

service = AtacService()
set_service(service)


@tool(name="bash")
def bash_tool(command: str) -> str:
    completed = subprocess.run(
        command,
        shell=True,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "bash failed")
    return completed.stdout.rstrip("\n")


def get_service() -> AtacService:
    return service
```

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
