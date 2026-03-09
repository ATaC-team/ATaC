import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { Background, Controls, MiniMap, ReactFlow } from "@xyflow/react";

import { buildFlowLayout } from "./lib/layout";
import { loadGraphAuditsFromDirectory } from "./lib/graphAudit";
import type { GraphAuditDocument } from "./types";

function App() {
  const [audits, setAudits] = useState<GraphAuditDocument[]>([]);
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
  const [status, setStatus] = useState("请选择 graph 根目录，页面会自动识别其中包含 graph.py 的子目录。");
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const deferredGraphId = useDeferredValue(selectedGraphId);
  const selectedGraph = useMemo(
    () => audits.find((audit) => audit.id === deferredGraphId) || null,
    [audits, deferredGraphId],
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
          <h1>Graph Flow Auditor</h1>
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
          <h2>Graphs</h2>
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
          <h2>Inspector</h2>
          {selectedGraph ? (
            <div className="inspector">
              <InspectorRow label="Graph Spec" value={selectedGraph.description?.graph_spec || "-"} />
              <InspectorRow label="Directory" value={selectedGraph.directory} />
              <InspectorRow label="State Schema" value={selectedGraph.stateSchema || "-"} />
              <InspectorRow
                label="Requires Agent"
                value={String(selectedGraph.description?.requires_agent ?? false)}
              />
              <InspectorRow label="Nodes" value={String(selectedGraph.nodes.length)} />
              <InspectorRow label="Edges" value={String(selectedGraph.edges.length)} />
            </div>
          ) : (
            <p className="empty">先从左侧选择一个 graph。</p>
          )}
        </section>

        <section className="panel">
          <h2>Node Audit</h2>
          {selectedGraph ? (
            <div className="node-audit">
              {selectedGraph.nodes.map((node) => (
                <article key={node.id} className={`node-audit__card kind-${node.kind}`}>
                  <div className="node-audit__head">
                    <strong>{node.id}</strong>
                    <span>{node.kind}</span>
                    {node.isAsync ? <span>async</span> : null}
                  </div>
                  <div className="node-audit__meta">
                    <div>
                      <label>tools</label>
                      <p>{node.toolCalls.map((item) => item.toolName).join(", ") || "none"}</p>
                    </div>
                    <div>
                      <label>agents</label>
                      <p>{node.agentCalls.map((item) => item.agentName).join(", ") || "none"}</p>
                    </div>
                  </div>
                  <pre>{node.source || "No source extracted."}</pre>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty">没有可显示的节点。</p>
          )}
        </section>
      </aside>

      <main className="canvas">
        {selectedGraph ? (
          <ReactFlow fitView nodes={flow.nodes} edges={flow.edges}>
            <MiniMap pannable zoomable />
            <Controls />
            <Background color="#d8cbb6" gap={18} />
          </ReactFlow>
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

export default App;
