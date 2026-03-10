# audit-ui

一个独立的 Vite + React Flow 前端，用来直接读取本地 graph 目录并渲染 flow。

## 功能

- 通过浏览器选择本地 graph 根目录
- 自动识别各子目录中的 `graph.py` 与 `description.yaml`
- 静态解析：
  - `StateGraph(...)`
  - `add_node(...)`
  - `add_edge(...)`
  - `get_service().tool_call(...)`
  - `get_service().get_agent(...)`
- 用 React Flow 渲染节点和边
- 侧边栏展示 graph 元信息和节点源码片段

## 启动

```bash
cd /Users/mob/ATaC/audit-ui
pnpm install
pnpm dev
```

## 构建

```bash
pnpm build
```

默认会输出到 [ui_dist](/Users/mob/ATaC/src/atac/ui_dist)，供 `atac ui` 直接读取。

## 当前边界

- 这是纯前端静态分析，不会执行 graph
- 目前重点支持常见的 `build_graph()` 写法
- 条件边和更复杂的动态构图暂未完整展示
