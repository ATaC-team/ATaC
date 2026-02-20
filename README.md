# ATaC (Agentic Trajectory as Code)

[English](#english) | [中文](#中文)

---

## 中文

ATaC 是一个专为 AI Agent 设计的声明式工作流 DSL 和 CLI 工具。它允许你将复杂的 Agent 行为（工具调用、条件判断、循环执行）定义为可分发、可复用的“轨迹码（Trajectory as Code）”。

### 🚀 核心特性
- **Agent 原生设计**: 专为 LLM Agent 协作设计。不仅提供人类可读的 YAML，还配套 `SKILL.md` 技能描述文件，让 Agent 能瞬间掌握操作技巧。
- **声明式 DSL**: 基于 YAML 定义工作流，支持循环 (`for`) 和条件判断 (`if-else`)。
- **MCP 原生支持**: 通过 `mcp://` 协议无缝集成 Model Context Protocol 服务器。
- **可视化寻址**: 使用 `atac show` 提供的路径坐标（如 `0.2.then`）实现对嵌套逻辑的精确操控。

### 🛠 执行器支持矩阵 (Executor Support)
| 执行器 (Executor) | 协议 (Scheme) | 状态 (Status) | 说明 |
| :--- | :--- | :--- | :--- |
| **MCP** | `mcp://` | ✅ 已支持 | 原生支持所有符合 MCP 标准的服务 |
| **Bash** | `bash://` | ✅ 已支持 | 支持本地终端命令及脚本执行 |
| **Claude Code** | - | 🚧 待开发 | 欢迎社区贡献内置工具集成 |
| **Kimi / Moonshot**| `kimi://` | ✅ 已支持 | 支持 Kimi-CLI 所有的内置工具 |

### � 快速开始

1. **安装 ATaC**
   推荐使用 [uv](https://docs.astral.sh/uv/) 进行隔离安装：
   ```bash
   uv tool install atac
   ```
   *(或者使用 `pip install atac`)*

2. **配置 MCP 服务 (以高德地图为例)**
   在 `mcp_config.json` 中添加服务并导出环境变量：
   ```json
   {
     "mcpServers": {
       "amap-maps": {
         "command": "npx",
         "args": ["-y", "@amap/amap-maps-mcp-server"],
         "env": { "AMAP_MAPS_API_KEY": "YOUR_API_KEY_HERE" }
       }
     }
   }
   ```
   ```bash
   export ATAC_MCP_SERVER_CONFIGS="path/to/mcp_config.json"
   ```

3. **集成技能到 Agent**
   将本项目中的技能文件夹复制到你的 Agent 技能目录中：
   ```bash
   cp -r skills/atac/ path/to/your/agent/skills/
   ```

4. **运行示例轨迹**
   ```bash
   atac run example/multi_province_center.yaml
   ```

### 🤝 贡献指南
我们欢迎各种形式的贡献！
1. **Fork** 本仓库并创建特性分支。
2. 确保所有更改都通过了 `pytest` 单测和 `ruff` 代码检查。
3. 提交 Pull Request，并详细描述你的更改。

---

## English

ATaC is a declarative workflow DSL and CLI tool designed specifically for AI Agents. It allows you to define complex agent behaviors—such as sequential tool calls, conditional branching, and iterative loops—as distributable and reusable "Trajectories as Code."

### 🚀 Key Features
- **Agent-Centric**: Built for LLM Agents. Every command and structure is designed to be easily manipulated by an AI, complemented by a dedicated `SKILL.md` for instant proficiency.
- **Declarative DSL**: Define workflows in YAML with built-in logic for `for` loops and `if-else` branches.
- **MCP Native**: Seamless integration with Model Context Protocol servers via the `mcp://` protocol.
- **Visual Addressing**: Precise management of nested logic using path coordinates (e.g., `0.2.then`) provided by `atac show`.

### 🛠 Executor Support Matrix
| Executor | Scheme | Status | Note |
| :--- | :--- | :--- | :--- |
| **MCP** | `mcp://` | ✅ Supported | Native support for all MCP servers |
| **Bash** | `bash://` | ✅ Supported | Run local terminal commands & scripts |
| **Claude Code** | - | 🚧 Pending | Community contributions are welcome! |
| **Kimi / Moonshot**| `kimi://` | ✅ Supported | Full support for Kimi-CLI built-in tools |

### � Quick Start

1. **Install ATaC**
   Recommended installation using [uv](https://docs.astral.sh/uv/):
   ```bash
   uv tool install atac
   ```
   *(Or use `pip install atac`)*

2. **Configure MCP (Example: Amap Maps)**
   Add the following to your `mcp_config.json` and export the path:
   ```json
   {
     "mcpServers": {
       "amap-maps": {
         "command": "npx",
         "args": ["-y", "@amap/amap-maps-mcp-server"],
         "env": { "AMAP_MAPS_API_KEY": "YOUR_API_KEY_HERE" }
       }
     }
   }
   ```
   ```bash
   export ATAC_MCP_SERVER_CONFIGS="path/to/mcp_config.json"
   ```

3. **Integrate Skills into Agent**
   Copy the `skills/atac/` directory provided in this project to your Agent's skill folder:
   ```bash
   cp -r skills/atac/ path/to/your/agent/skills/
   ```

4. **Run Example Trajectory**
   ```bash
   atac run example/multi_province_center.yaml
   ```

### 🤝 Contributing
Contributions of any kind are welcome!
1. **Fork** the repository and create your feature branch.
2. Ensure all changes pass `pytest` unit tests and `ruff` linting.
3. Submit a Pull Request with a detailed description of your changes.

---

### License
MIT License.