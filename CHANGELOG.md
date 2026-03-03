# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.4.5] - 2026-03-03

### 中文

#### 重构
- **ATaC Memory MCP**: 将 `memory_search` 的 MCP 入参从单个字符串调整为字符串数组，便于 Agent 显式传递多关键词检索条件。
- **ATaC Memory Core**: 同步扩展内部搜索接口，支持字符串和字符串数组两种输入形式，保持 CLI 检索行为不变。

### English

#### Changed
- **ATaC Memory MCP**: Changed the `memory_search` MCP input from a single string to a string array so agents can pass explicit multi-term queries.
- **ATaC Memory Core**: Extended the internal search API to accept both strings and string arrays while keeping CLI search behavior unchanged.

## [0.4.4] - 2026-03-03

### 中文

#### 修正
- **ATaC Memory**: 将目录化记忆 bundle 的入口从误设的 `index.html` 更正为 `index.yaml`，不再引入 HTML 表达层，聚焦纯 YAML 存储。
- **ATaC Memory CLI / MCP / Docs**: 同步更新 memory CLI、独立 memory MCP、README、`skills/atac-memory` 和相关测试，使其与 `index.yaml` 入口保持一致。

### English

#### Fixed
- **ATaC Memory**: Corrected the bundle entry file from the mistaken `index.html` to `index.yaml`, removing the unnecessary HTML layer and keeping memory storage YAML-first.
- **ATaC Memory CLI / MCP / Docs**: Updated the memory CLI, standalone memory MCP server, README, `skills/atac-memory`, and related tests to align with the `index.yaml` bundle entry.

## [0.4.3] - 2026-03-03

### 中文

#### 重构
- **ATaC Memory**: 将记忆存储从单个 YAML 文件重构为目录 bundle，统一使用 `.atac/.memory/<name>/index.html` 作为入口，并允许在目录内附带脚本等辅助文件。
- **ATaC Memory CLI / MCP / Skill**: 更新了 `memory` 子命令、独立 memory MCP、README 和 `skills/atac-memory` 文档，使其与新的 bundle 存储结构保持一致，同时保留对旧版 YAML 记忆文件的读取兼容。

### English

#### Changed
- **ATaC Memory**: Refactored memory storage from single YAML files into directory bundles with `.atac/.memory/<name>/index.html` as the entry point, allowing helper scripts and related files to live alongside each memory.
- **ATaC Memory CLI / MCP / Skill**: Updated the `memory` CLI commands, standalone memory MCP server, README, and `skills/atac-memory` documentation to match the new bundle format while preserving read compatibility for legacy YAML memories.

## [0.4.2] - 2026-03-03

### 中文

#### 优化
- **ATaC Memory**: 优化 `search` 搜索算法，支持多关键词模糊匹配（AND 逻辑），可同时匹配名称、描述和标签。

### English

#### Changed
- **ATaC Memory**: Optimized the `search` function to support multi-keyword fuzzy matching across name, description, and tags.

## [0.4.1] - 2026-03-03

### 中文

#### 优化
- **ATaC Memory**: 变更默认记忆存储目录，由 `.atac/memory/` 修改为隐藏目录 `.atac/.memory/` 以减少对项目结构的视觉干扰。

### English

#### Changed
- **ATaC Memory**: Changed the default memory storage directory from `.atac/memory/` to a hidden directory `.atac/.memory/` to reduce visual clutter in project structures.

## [0.4.0] - 2026-03-03

### 中文

#### 新特性
- **ATaC Memory 模块**: 引入了 Agent 记忆存储系统，允许将验证过的任务模式（Task Patterns）作为 YAML 格式持久化。
  - **规范化 Schema**: 定义了支持 `note` 与 `tool` 提示的灵活结构。
  - **CLI 管理**: 新增了 `atac memory` 命令组（包含 `save`, `list`, `read`, `search`, `delete` 等命令）。
  - **独立 MCP Server**: 提供了 `atac memory-mcp` 命令，将记忆检索和管理功能暴露为标准的 MCP Tools。

### English

#### Features
- **ATaC Memory Module**: Introduced an agent memory store to persist validated task patterns as YAML files.
  - **Standardized Schema**: Defined a flexible schema supporting `note` and `tool` hints.
  - **CLI Management**: Added the `atac memory` command group with operations like `save`, `list`, `read`, `search`, and `delete`.
  - **Standalone MCP Server**: Provided the `atac memory-mcp` command to expose memory retrieval and management as standard MCP Tools.

## [0.3.5] - 2026-03-03

### 中文

#### 改进
- 对齐了 `atac mcp` 的功能

### English

#### Improvements
- Aligned the functionality of `atac mcp`

## [0.3.4] - 2026-03-02

### 中文

#### 重构与改进 (Refactoring & Improvements)
- **[UI Backend FastAPI Refactor]** 进一步重构了内置的 Python UI 服务器，使用工业级的 **FastAPI** 和 **Uvicorn** 完全替换了基础的 `http.server`，带来由 Pydantic 强类型校验支撑的 API、更高的性能，以及完善的单页应用（SPA）历史路由回退支持。
- **[Global Working Directory]** 所有 CLI 命令现已支持全局参数 `-C` / `--cwd <path>`，允许从任意路径直接将 `atac` 挂载到目标目录下执行操作，而无须提前通过 `cd` 切换目录。

### English

#### Refactoring & Improvements
- **[UI Backend FastAPI Refactor]** Further refactored the embedded Python UI server by replacing the basic `http.server` with an industrial-grade **FastAPI** application running on **Uvicorn**. This brings massive performance gains, robust typed API validation via Pydantic, and flawless SPA history fallback routing for the frontend.
- **[Global Working Directory]** All CLI commands now support a global parameter `-C` / `--cwd <path>`. This allows executing any `atac` command against an arbitrary target directory environment without needing to manually `cd` into it first.

## [0.3.3] - 2026-03-01

### 中文

#### 重构与改进 (Refactoring & Improvements)
- **[UI Architecture]** 彻底重构了 `atac ui` 的运行机制，实现了真正的即插即用：
  - **静态构建**：前端 Vue/React 项目现在已被预编译为静态产物，并直接打包在 `atac.ui_static` Python 包内，不再依赖用户本地的 Node.js/NPM 开发环境。
  - **原生 Python 后端**：移除了笨重的 Express.js 后端，内置了一个极其轻量级的原生 Python HTTP Server (`ui_server.py`) 来提供 API 服务和静态资源托管。
  - **全局可用**：`atac ui` 命令现在可以在系统上的**任何目录**直接拉起（如 Home 目录），并且会自动打开默认浏览器，告别了因强依赖仓库源码结构而导致的路径找不到或端口冲突问题。
  - **TS 修复**：修复了 UI 编译阶段遇到的 TypeScript 未使用变量导致的构建阻断问题。

### English

#### Refactoring & Improvements
- **[UI Architecture]** Completely refactored the execution mechanics of `atac ui`, achieving true plug-and-play capability:
  - **Static Build**: The frontend Vue/React project is now pre-compiled into static assets and bundled directly within the `atac.ui_static` Python package, removing the dependency on a local Node.js/NPM development environment.
  - **Native Python Backend**: Removed the heavy Express.js backend and replaced it with a highly lightweight native Python HTTP Server (`ui_server.py`) for API routing and static file hosting.
  - **Global Accessibility**: The `atac ui` command can now be launched from **any directory** on your system (e.g., your Home directory) and will automatically open the default browser. This eliminates path resolution errors and port conflicts caused by strict dependencies on the repository's source structure.
  - **TS Fixes**: Fixed a TypeScript unused variable error that blocked the frontend build process.

## [0.3.2] - 2026-02-25

### 中文

#### 新增与改进 (New Features & Improvements)
- **[CLI Configuration]** `atac config` 命令现支持接收多个 `key=value`对（`nargs=-1`）。对于重复的键（如 `mcp_config`），会自动聚合为 JSON 列表，方便管理多个 MCP 配置文件。
- **[Configuration Priority]** 优化了配置加载优先级：`.atac/atac.json` 中的设置（如 `mcp_config`）现在具有最高优先级，即使在加载时也会覆盖 `ATAC_MCP_SERVER_CONFIGS` 环境变量，确保项目级配置生效。
- **[UI Enhancements]**
  - **动态列表配置**：前端“MCP Server ConfigsPath”输入框升级为动态列表，支持一键添加/删除多个配置文件路径。
  - **自动发现与加载**：UI 启动时会自动扫描工作区目录下的 `.atac/` 文件夹，并智能识别其中包含 `index.yaml`/`index.json` 的子目录作为有效工作区，无需手动输入路径。
  - **体验优化**：移除了 `localStorage` 缓存机制，确保每次打开 UI 都加载最新配置。

### English

#### New Features & Improvements
- **[CLI Configuration]** The `atac config` command now supports accepting multiple `key=value` pairs (`nargs=-1`). Duplicate keys (e.g., `mcp_config`) are automatically aggregated into a JSON list, facilitating the management of multiple MCP configuration files.
- **[Configuration Priority]** Optimized configuration loading priority: settings in `.atac/atac.json` (such as `mcp_config`) now take the highest precedence, overriding `ATAC_MCP_SERVER_CONFIGS` environment variables during loading to ensure project-level configurations are applied.
- **[UI Enhancements]**
  - **Dynamic List Configuration**: The "MCP Server ConfigsPath" input in the frontend has been upgraded to a dynamic list, supporting one-click addition/removal of multiple configuration file paths.
  - **Auto-Discovery & Loading**: Upon startup, the UI automatically scans the `.atac/` folder in the workspace directory and intelligently identifies subdirectories containing `index.yaml`/`index.json` as valid workspaces, eliminating the need for manual path entry.
  - **UX Optimization**: Removed `localStorage` caching mechanisms to ensure the latest configuration is loaded every time the UI is opened.

## [0.3.1] - 2026-02-25

### 中文

#### 重构 (Refactoring)
- **[Core]** 进一步重构了 `ATaC` 类的核心架构，将原散落在 `cli.main` 中的工作区辅助函数（`load_trajectory`、`save_trajectory`、`get_workspaces` 等）统一收编为 `atac.core.atac_api.ATaC` 下的静态方法（Static Methods）。
- **[Runtime]** 梳理并重构了内部的 Executor 导出机制，新增了 `executors/__init__.py`，并在 `atac_api.py`、`runtime.py` 及全量测试环境统一从主包层级调用 `BashExecutor`、`McpExecutor`，彻底消除了冗余及容易引发隐患的深层显式导包。

### English

#### Refactored
- **[Core]** Substantially refactored the core `ATaC` engine design, migrating detached workspace utility functions (e.g., `load_trajectory`, `save_trajectory`, `get_workspaces`) from the `cli.main` module directly into `atac.core.atac_api.ATaC` as static methods for improved programmatic utilization.
- **[Runtime]** Restructured the internal executor exporting mechanics by introducing an `__init__.py` interface to the `executors` module layer. Streamlined the internal dependency graph and resolved scattered manual deep imports for `BashExecutor` and `McpExecutor` across `atac_api`, `runtime`, and the testing suite.

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
