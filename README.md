<p align="center">
  <img src="assets/logo.svg" alt="ATaC Logo" width="500"/>
</p>

# ATaC — Agentic Trajectory as Code

[![PyPI version](https://img.shields.io/pypi/v/atac?color=blue&logo=pypi&logoColor=white)](https://pypi.org/project/atac/)
[![Python versions](https://img.shields.io/pypi/pyversions/atac?logo=python&logoColor=white)](https://pypi.org/project/atac/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI Status](https://github.com/ATaC-team/ATaC/actions/workflows/cd.yml/badge.svg)](https://github.com/ATaC-team/ATaC/actions)


[English](#english) | [中文](#中文)

---

## 中文

ATaC (Agentic Trajectory as Code) 提供了一套专为 AI Agent 设计的**声明式轨迹录制与回放接口**。它作为一个轻量级的协议载体，通过统一的协议总线（Protocol Bus）无缝接入标准 MCP 服务，以及市面上各大 Agent 应用与框架的原生内置工具。通过 ATaC，开发者能将智能体运行时的动态调用流，固化为可流转、可复用、可精确重构的静态代码资产。

### 🛠 核心能力
- **轨迹录制**: 将智能体非结构化的工具调用历史，持久化为标准化的静态 `.yaml` 资产。
- **精确回放**: 搭载轻量化执行引擎，按序、精确还原复杂环境下的工具执行序列。
- **声明式控制流**: 在 YAML 轨迹中原生支持循环 (`for`) 和条件 (`if-else`) 逻辑编排。
- **多协议总线**: 统一调度 `mcp://` (Model Context Protocol)、`bash://` 等多源执行环境。

### 📋 执行器兼容性
| 执行器 | 协议 | 状态 | 说明 |
| :--- | :--- | :--- | :--- |
| **MCP** | `mcp://` | ✅ 已支持 | 原生支持所有标准 MCP 服务 |
| **Bash** | `bash://` | ✅ 已支持 | 支持本地终端命令及脚本执行 |
| **Kimi / Moonshot**| `kimi://` | ✅ 已支持 | 支持 Kimi-CLI 内置工具（需加锁 `[kimi]` 安装） |
| **Claude Code** | `claude://` | 🚧 规划中 | 待集成内置工具集 |

### 🤖 自主构建与流转示例

#### 1. 自动化构建 (CLI)

Agent 可以通过以下指令序列自主生成 `lookup.yaml` 轨迹文件：

```bash
# 1. 初始化并定义输入变量
atac init lookup.yaml --name "GeoSearch"
atac add-input lookup.yaml --name provinces --type list

# 2. 注入逻辑结构 (For 循环)
atac add-for lookup.yaml --in '${inputs.provinces}' --item province

# 3. 在指定位置插入动作 (支持路径寻址)
atac add-action lookup.yaml --at 0 --id geo --action "mcp://amap/maps_geo" --args '{"address": "${variables.province}"}'

# 4. 预览生成的结构
atac show lookup.yaml

```

#### 2. 嵌套轨迹调用 (Sub-Workflows)

ATaC 原生支持通过 `bash://run` 调用其它 ATaC 文件，从而实现模块化与依赖复用：

```yaml
# 在 parent.yaml 中
steps:
  - id: call_sub
    type: action
    action: bash://run
    args:
      command: atac run child.yaml --input city="Beijing"
```


### 🚀 快速开始

1. **安装**
```bash
uv tool install atac  # 极简模式（无内置工具包，启动最快）

# 如果需要使用 Kimi 等平台特供执行器的工具，可以额外引入对应扩展包：
uv tool install "atac[kimi]"
```

2. **配置 MCP 环境**
```bash
export ATAC_MCP_SERVER_CONFIGS="path/to/mcp_config.json"

```

3. **执行轨迹**
```bash
atac run example/multi_province_center.yaml

```

4. **作为 MCP Server 启动**
任何支持 MCP 的客户端 (如 Claude Desktop 或 Cursor) 均可将 ATaC 作为工具集连接：
```json
{
  "mcpServers": {
    "atac": {
      "command": "atac",
      "args": ["mcp"],
      "env": {
        "ATAC_MCP_SERVER_CONFIGS": "path/to/mcp_config.json"
      }
    }
  }
}
```
*如果尚未在全局安装，也可以使用 `uvx` 直接运行（推荐）：*
```json
{
  "mcpServers": {
    "atac": {
      "command": "uvx",
      "args": ["atac", "mcp"],
      "env": {
        "ATAC_MCP_SERVER_CONFIGS": "path/to/mcp_config.json"
      }
    }
  }
}
```
---

## English

ATaC (Agentic Trajectory as Code) provides a set of **declarative trajectory recording and replay interfaces** tailored specifically for AI Agents. Acting as a lightweight routing layer, it employs a unified protocol bus capable of seamlessly connecting to strictly standardized MCP servers alongside the proprietary built-in tools of various Agent applications and frameworks. Through ATaC, developers can persist an agent's dynamic execution flow into modular, reusable, and deterministic static code assets.

### 🛠 Key Features

* **Trajectory Recording**: Persists unstructured agent tool invocations into standardized, static `.yaml` assets.
* **Precise Replay**: Powered by a lightweight runtime engine to predictably execute complex tool sequences.
* **Declarative Control Flow**: Native `for` loop and `if-else` condition routing directly within the YAML schema.
* **Multi-protocol Bus**: Unified execution pipeline bridging `mcp://`, `bash://`, and various platform APIs.

### 📋 Executor Support

| Executor | Scheme | Status | Note |
| --- | --- | --- | --- |
| **MCP** | `mcp://` | ✅ Supported | Native support for all MCP servers |
| **Bash** | `bash://` | ✅ Supported | Local shell commands and scripts |
| **Kimi / Moonshot** | `kimi://` | ✅ Supported | Full Kimi-CLI toolset support (requires `[kimi]` extra) |
| **Claude Code** | `claude://`| 🚧 Roadmap | Built-in tool integration pending |

### 🤖 Authoring & Workflow Examples

#### 1. Authoring Flow (CLI)

Agents can generate a `lookup.yaml` trajectory via direct CLI commands:

```bash
atac init lookup.yaml --name "GeoSearch"
atac add-input lookup.yaml --name provinces --type list
atac add-for lookup.yaml --in '${inputs.provinces}' --item province
atac add-action lookup.yaml --at 0 --id geo --action "mcp://amap/maps_geo" --args '{"address": "${variables.province}"}'

```

#### 2. Nested Trajectories (Sub-Workflows)

ATaC supports executing other ATaC files natively via the `bash://run` executor, allowing you to build modular, reusable sub-workflows:

```yaml
# Inside parent.yaml
steps:
  - id: call_sub
    type: action
    action: bash://run
    args:
      command: atac run child.yaml --input city="Beijing"
```

### 🚀 Quick Start

1. **Installation**
```bash
uv tool install atac

# To enable platform-specific built-in tools like Kimi, install with extras:
uv tool install "atac[kimi]"
```

2. **MCP Configuration**
```bash
export ATAC_MCP_SERVER_CONFIGS="path/to/mcp_config.json"

```

3. **Run**
```bash
atac run example/multi_province_center.yaml

```

4. **Run as MCP Server**
Any MCP-compatible client (like Claude Desktop or Cursor) can connect to ATaC to author and run trajectories:
```json
{
  "mcpServers": {
    "atac": {
      "command": "atac",
      "args": ["mcp"],
      "env": {
        "ATAC_MCP_SERVER_CONFIGS": "path/to/mcp_config.json"
      }
    }
  }
}
```
*If not installed globally, you can also use `uvx` directly (Recommended):*
```json
{
  "mcpServers": {
    "atac": {
      "command": "uvx",
      "args": ["atac", "mcp"],
      "env": {
        "ATAC_MCP_SERVER_CONFIGS": "path/to/mcp_config.json"
      }
    }
  }
}
```

### License

MIT