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
# 1. 初始化并定义输入变量 (自动创建 .atac/GeoSearch 目录结构)
atac init GeoSearch --description "GeoSearch workflow"
atac add-input GeoSearch --name provinces --type list

# 2. 注入逻辑结构 (For 循环)
atac add-for GeoSearch --in '${inputs.provinces}' --item province

# 3. 在指定位置插入动作 (支持路径寻址)
atac add-action GeoSearch --at 0 --id geo --action "mcp://amap/maps_geo" --args '{"address": "${variables.province}"}'

# 4. 预览生成的结构
atac show GeoSearch

```

#### 2. 嵌套轨迹调用 (Sub-Workflows)

ATaC 原生支持通过 `bash://run` 调用其它 ATaC 文件，从而实现模块化与依赖复用：

```yaml
# 在 parent 轨迹的 index.yaml 中
steps:
  - id: call_sub
    type: action
    action: bash://run
    args:
      command: atac run child_workspace --input city="Beijing"
```


### 🚀 快速开始

#### 1. 安装与环境配置

```bash
uv tool install atac  # 极简模式（推荐）

# 挂载您的任意外部 MCP 服务器环境配置：
# (支持配置多个配置文件路径，使用逗号分隔)
export ATAC_MCP_SERVER_CONFIGS="path/to/mcp_config_1.json,path/to/mcp_config_2.json"
```

#### 2. 以 Skills 形式引入
将项目中的 `skills/atac` 目录复制到您 Agent 工作区的 `skills/` 目录下即可激活：

```bash
cp -r path/to/ATaC/skills/atac ./skills/
```

#### 3. 以 MCP Server 形式引入
在支持 MCP 协议的应用程序配置中添加 ATaC：

```json
{
  "mcpServers": {
    "atac": {
      "command": "uvx",
      "args": ["atac", "mcp"],
      "env": {
        "ATAC_MCP_SERVER_CONFIGS": "path/to/mcp_config_1.json,path/to/mcp_config_2.json"
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
# Create a new workspace at .atac/GeoSearch
atac init GeoSearch --description "GeoSearch workflow"
atac add-input GeoSearch --name provinces --type list
atac add-for GeoSearch --in '${inputs.provinces}' --item province
atac add-action GeoSearch --at 0 --id geo --action "mcp://amap/maps_geo" --args '{"address": "${variables.province}"}'

```

#### 2. Nested Trajectories (Sub-Workflows)

ATaC supports executing other ATaC files natively via the `bash://run` executor, allowing you to build modular, reusable sub-workflows:

```yaml
# Inside parent workspace's index.yaml
steps:
  - id: call_sub
    type: action
    action: bash://run
    args:
      command: atac run child_workspace --input city="Beijing"
```

### 🚀 Quick Start

#### 1. Installation & Environment Setup

```bash
uv tool install atac  # Minimal installation (Recommended)

# Mount your external MCP server configurations:
# (Multiple config files are supported, separate paths with a comma)
export ATAC_MCP_SERVER_CONFIGS="path/to/mcp_config_1.json,path/to/mcp_config_2.json"
```

#### 2. Introduce as Skills
Copy the `skills/atac` directory from this repository into your Agent workspace's `skills/` directory:

```bash
cp -r path/to/ATaC/skills/atac ./skills/
```

#### 3. Introduce as an MCP Server
Add ATaC to the configuration of any MCP-compatible application:

```json
{
  "mcpServers": {
    "atac": {
      "command": "uvx",
      "args": ["atac", "mcp"],
      "env": {
        "ATAC_MCP_SERVER_CONFIGS": "path/to/mcp_config_1.json,path/to/mcp_config_2.json"
      }
    }
  }
}
```

### License

MIT