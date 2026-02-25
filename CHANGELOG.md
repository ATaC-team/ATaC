# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.0] - 2026-02-25

### 中文

#### 移除
- **[Integration]** 暂时移除了对于 `kimi-cli` 和 `KimiExecutor` 的原生融合支持。由于底层的 `mcp` 与 `kosong` 构成了无法调和的钻石依赖冲突（Diamond Dependency Conflict），我们决定先保证 ATaC 主干环境的纯洁性。
- **[Roadmap]** 后续我们会抛弃强耦合引入，改为设计一套全新的独立 Worker/Plugin 架构，从而安全、隔离地接入各大主流 Agent SDK（如 Kimi、Claude 等）的原生内置工具。

### English

#### Removed
- **[Integration]** Temporarily removed the `KimiExecutor` and `kimi-cli` optional dependencies due to deep unresolvable dependency conflicts with the underlying `kosong` and `mcp` libraries. 
- **[Roadmap]** We will introduce a brand-new, robust Plugin/Worker architecture in the future to natively support various AI Agent SDK built-in tools (including Kimi and Claude) without polluting the core ATaC dependency tree.




## [0.2.0] - 2026-02-25

### Added / 新增
- **[CLI]** Added the new `atac list` command to display all instantiated trajectory workspaces and their descriptions in the `.atac/` directory.
- **[CLI]** 新增了 `atac list` 命令，用于快速列出当前目录（`.atac/`）下所有已实例化的工作区及其描述。
- **[MCP]** Added the new `atac_list` tool to the MCP server to allow AI Agents to dynamically discover available workspace trajectories.
- **[MCP]** MCP 服务端新增了 `atac_list` 工具，以便于 AI 智能体能动态嗅探并发现当前目录下所有可用的工作区轨迹。

### Changed / 变更
- **[Architecture]** Transitioned from single-file trajectory scripts to a full-fledged `.atac/<workspace_name>/index.yaml` workspace architecture.
- **[Architecture]** 彻底告别了早期的单文件脚本模式，正式引入了结构化的 `.atac/<workspace_name>/index.yaml` 工作区架构。
- **[CLI & MCP]** All CLI commands (`init`, `run`, `show`, `add-*`, `rm`) and MCP tools (`atac_add_*`, `atac_show`, `atac_run`) now accept intuitive workspace `name` wrappers instead of strict physical file paths. Legacy `.yaml` paths are still backward compatible.
- **[CLI & MCP]** 所有 CLI 指令和 MCP 工具全面调整为接收并解析抽象的 `name`（工作区名称），大幅降低了 Agent 认知负担和文件路径拼写出错的概率，同时依旧向下兼容传统的 `.yaml` 文件路径传参。

## [0.1.5] - 2026-02-23

### Changed / 变更
- **[Architecture]** Refactored the internal `KimiExecutor` to utilize the native PyPI `kimi-cli` logic instead of searching the system directory via subprocess paths.
- **[Architecture]** 彻底重构了内部的 `KimiExecutor`：抛弃了基于子进程的环境探测机制，改为利用原生 PyPI `kimi-cli` 作为扩展底座。
- **[Engineering]** Shifted `kimi-cli` to a project optional dependency to reduce the default installation footprint of ATaC. Users evaluating the Kimi builtin tools must now install via `uv pip install "atac[kimi]"`.
- **[Engineering]** 将 `kimi-cli` 移至项目的可选依赖列表中（Optional Dependencies），极大缩减了 ATaC 的基础安装体积。只有当您需要使用 Kimi 特供工具时只需加锁安装 `"atac[kimi]"` 即可。
