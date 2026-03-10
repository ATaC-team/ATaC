import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type NodeMouseHandler,
} from "@xyflow/react";

import { buildFlowLayout } from "./lib/layout";
import { loadGraphAuditsFromDirectory } from "./lib/graphAudit";
import type { GraphAuditDocument } from "./types";

function App() {
  const [audits, setAudits] = useState<GraphAuditDocument[]>([]);
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [status, setStatus] = useState("请选择 graph 根目录，页面会自动识别其中包含 graph.py 的子目录。");
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const deferredGraphId = useDeferredValue(selectedGraphId);
  const selectedGraph = useMemo(
    () => audits.find((audit) => audit.id === deferredGraphId) || null,
    [audits, deferredGraphId],
  );
  const selectedNodeAudit = useMemo(
    () => selectedGraph?.nodes.find((node) => node.id === selectedNodeId) || null,
    [selectedGraph, selectedNodeId],
  );

  const flow = useMemo(() => {
    if (!selectedGraph) return { nodes: [], edges: [] };
    return buildFlowLayout(selectedGraph.nodes, selectedGraph.edges);
  }, [selectedGraph]);

  useEffect(() => {
    const input = fileInputRef.current;
    if (!input) return;
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    setSelectedNodeId(selectedGraph?.nodes[0]?.id ?? null);
  }, [selectedGraph]);

  const handleNodeClick = useMemo<NodeMouseHandler>(
    () => (_event, node) => {
      setSelectedNodeId(node.id);
    },
    [],
  );

  async function handleDirectorySelection(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsLoading(true);
    setStatus("正在读取目录并解析 graph...");
    try {
      const nextAudits = await loadGraphAuditsFromDirectory(files);
      startTransition(() => {
        setAudits(nextAudits);
        setSelectedGraphId(nextAudits[0]?.id ?? null);
        setSelectedNodeId(nextAudits[0]?.nodes[0]?.id ?? null);
      });
      setStatus(`已加载 ${nextAudits.length} 个 graph。`);
    } catch (error) {
      setStatus(`解析失败: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
      event.target.value = "";
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__header">
          <p className="eyebrow">ATaC Audit UI</p>
          <h1>流程审计台</h1>
          <p className="lede">
            直接选择 graph 根目录，前端会读取各子目录下的 <code>graph.py</code> 和
            <code>description.yaml</code>，并渲染流程图。
          </p>
        </div>

        <label className="picker">
          <span>{isLoading ? "读取中..." : "选择 Graph 目录"}</span>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleDirectorySelection}
          />
        </label>

        <p className="status">{status}</p>

        <section className="panel">
          <h2>图列表</h2>
          <div className="graph-list">
            {audits.length === 0 ? (
              <p className="empty">还没有读取到 graph。</p>
            ) : (
              audits.map((audit) => (
                <button
                  key={audit.id}
                  className={`graph-item ${selectedGraphId === audit.id ? "is-active" : ""}`}
                  onClick={() => setSelectedGraphId(audit.id)}
                  type="button"
                >
                  <strong>{audit.id}</strong>
                  <span>{audit.description?.description || audit.directory}</span>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="panel">
          <h2>概览</h2>
          {selectedGraph ? (
            <div className="inspector">
              <InspectorRow label="Graph 入口" value={selectedGraph.description?.graph_spec || "-"} />
              <InspectorRow label="目录" value={selectedGraph.directory} />
              <InspectorRow label="状态结构" value={selectedGraph.stateSchema || "-"} />
              <InspectorRow
                label="依赖子代理"
                value={String(selectedGraph.description?.requires_agent ?? false)}
              />
              <InspectorRow label="节点数" value={String(selectedGraph.nodes.length)} />
              <InspectorRow label="连线数" value={String(selectedGraph.edges.length)} />
            </div>
          ) : (
            <p className="empty">先从左侧选择一个 graph。</p>
          )}
        </section>

        <section className="panel">
          <h2>当前节点</h2>
          {selectedNodeAudit ? (
            <article className={`node-audit__card kind-${selectedNodeAudit.kind}`}>
              <div className="node-audit__head">
                <strong>{selectedNodeAudit.id}</strong>
                <span>{kindLabel(selectedNodeAudit.kind)}</span>
                {selectedNodeAudit.isAsync ? <span>异步</span> : null}
              </div>
              <div className="node-audit__meta">
                <div>
                  <label>工具调用</label>
                  <p>
                    {selectedNodeAudit.toolCalls.map((item) => item.toolName).join(", ") || "无"}
                  </p>
                </div>
                <div>
                  <label>代理调用</label>
                  <p>
                    {selectedNodeAudit.agentCalls.map((item) => item.agentName).join(", ") || "无"}
                  </p>
                </div>
              </div>
              <div className="node-audit__docstring">
                <label>节点说明</label>
                <p>{selectedNodeAudit.docstring || "未提供节点说明。"}</p>
              </div>
              <details className="code-details">
                <summary>展开源码</summary>
                <pre
                  className="code-block"
                  dangerouslySetInnerHTML={{
                    __html: highlightPythonSource(
                      selectedNodeAudit.source || "未提取到源码。",
                    ),
                  }}
                />
              </details>
            </article>
          ) : (
            <p className="empty">点击右侧 flow 中的节点后，这里会显示详细信息。</p>
          )}
        </section>
      </aside>

      <main className="canvas">
        {selectedGraph ? (
          <div className="canvas__flow">
            <ReactFlow
              fitView
              nodes={flow.nodes}
              edges={flow.edges}
              onNodeClick={handleNodeClick}
            >
              <MiniMap pannable zoomable />
              <Controls />
              <Background color="#d8cbb6" gap={18} />
            </ReactFlow>
          </div>
        ) : (
          <div className="canvas__empty">
            <h2>等待加载 graph</h2>
            <p>选择一个 graph 根目录后，这里会用 React Flow 渲染节点与边。</p>
          </div>
        )}
      </main>
    </div>
  );
}

function InspectorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="inspector__row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function kindLabel(kind: string) {
  const mapping: Record<string, string> = {
    logic: "逻辑节点",
    tool: "工具节点",
    agent: "代理节点",
    mixed: "混合节点",
  };
  return mapping[kind] || kind;
}

function highlightPythonSource(source: string) {
  const escaped = escapeHtml(source);
  return escaped
    .replace(
      /\b(async|await|def|return|if|else|elif|for|in|from|import|class|try|except|raise|with|as|None|True|False)\b/g,
      '<span class="token token-keyword">$1</span>',
    )
    .replace(/(&quot;.*?&quot;|&#39;.*?&#39;)/g, '<span class="token token-string">$1</span>')
    .replace(/\b(get_service|tool_call|get_agent)\b/g, '<span class="token token-call">$1</span>');
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export default App;
