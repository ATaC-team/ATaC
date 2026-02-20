# ATaC (Agentic Trajectory as Code)

[English](#english) | [中文](#中文)

---

## 中文

ATaC 是一个专为 AI Agent 设计的声明式工作流 DSL 和 CLI 工具。它允许你将复杂的 Agent 行为（工具调用、条件判断、循环执行）定义为可分发、可复用的“轨迹码（Trajectory as Code）”。

### 🚀 核心特性
- **Agent 原生设计**: 专为 LLM Agent 协作设计。不仅提供人类可读的 YAML，还配套 `SKILL.md` 技能描述文件，让 Agent 能瞬间掌握操作技巧。
- **声明式 DSL**: 基于 YAML 定义工作流，支持循环 (`for`) 和条件判断 (`if-else`)。
- **MCP 原生支持**: 通过 `mcp://` 协议无缝集成 Model Context Protocol 服务器。
- **可视化寻址**: 通过 `atac show` 提供的路径坐标（如 `0.2.then`）让 Agent 像操控手术刀一样精确管理嵌套逻辑。

### 🛠 执行器支持矩阵 (Executor Support)
| 执行器 (Executor) | 协议 (Scheme) | 状态 (Status) | 说明 |
| :--- | :--- | :--- | :--- |
| **MCP** | `mcp://` | ✅ 已支持 | 原生支持所有符合 MCP 标准的服务 |
| **Bash** | `bash://` | ✅ 已支持 | 支持本地终端命令及脚本执行 |
| **Claude Code** | - | 🚧 待开发 | 欢迎社区贡献内置工具集成 |
| **Kimi / Moonshot**| `kimi://` | ✅ 已支持 | 支持 Kimi-CLI 所有的内置工具 |

### 📄 Agent 集成 (Skills)
如果你在开发 Agent 辅助系统，只需将项目中的 `SKILL.md` 提供给 Agent（如作为 System Prompt 的一部分或 Skill 文件夹），它就能理解如何自主构建、调试和运行复杂的任务轨迹。

> [!TIP]
> **推荐实践**：
> ```bash
> # 1. 将技能文件集成到 Agent
> cp SKILL.md path/to/your/agent/skills/
> 
> # 2. 配置 MCP 服务目录
> export ATAC_MCP_SERVER_CONFIGS="/path/to/your/mcp/config.json"
> ```

### 📦 快速开始
```bash
pip install atac

# 运行已有的轨迹
atac run trajs/multi_province_center.yaml
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
- **Visual Addressing**: Precise control over nested logic using path coordinates (e.g., `0.2.then`) from `atac show`.

### 🛠 Executor Support Matrix
| Executor | Scheme | Status | Note |
| :--- | :--- | :--- | :--- |
| **MCP** | `mcp://` | ✅ Supported | Native support for all MCP servers |
| **Bash** | `bash://` | ✅ Supported | Run local terminal commands & scripts |
| **Claude Code** | - | 🚧 Pending | Community contributions are welcome! |
| **Kimi / Moonshot**| `kimi://` | ✅ Supported | Full support for Kimi-CLI built-in tools |

### 📄 Agent Integration (Skills)
The core value of ATaC lies in its **Skill System**. By providing the `SKILL.md` (found in the project root) to your Agent, it gains the immediate ability to autonomously architect, debug, and execute complex task trajectories.

> [!TIP]
> **Best Practice**:
> ```bash
> # 1. Integrate the skill file into your Agent
> cp SKILL.md path/to/your/agent/skills/
> 
> # 2. Configure the MCP service directory
> export ATAC_MCP_SERVER_CONFIGS="/path/to/your/mcp/config.json"
> ```

### 📦 Quick Start
```bash
pip install atac

# Run an existing trajectory
atac run trajs/multi_province_center.yaml
```

### 🤝 Contributing
Contributions of any kind are welcome!
1. **Fork** the repository and create your feature branch.
2. Ensure all changes pass `pytest` unit tests and `ruff` linting.
3. Submit a Pull Request with a detailed description of your changes.

---

### License
MIT License.