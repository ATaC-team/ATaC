import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type NodeMouseHandler,
} from "@xyflow/react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

import { buildFlowLayout } from "./lib/layout";
import { loadGraphAuditsFromDirectory } from "./lib/graphAudit";
import type { GraphAuditDocument } from "./types";

function App() {
  const [audits, setAudits] = useState<GraphAuditDocument[]>([]);
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [status, setStatus] = useState("");
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
    setIsSourceModalOpen(false);
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
    <div className="grid h-full min-w-0 grid-cols-[380px_minmax(0,1fr)] overflow-hidden bg-neutral-100 text-neutral-950 max-[1100px]:grid-cols-1 max-[1100px]:grid-rows-[auto_minmax(420px,1fr)]">
      <aside className="min-w-0 overflow-auto border-r border-neutral-300 bg-neutral-50 px-5 py-5 max-[1100px]:border-r-0 max-[1100px]:border-b">
        <header className="mb-5 rounded-none border border-neutral-300 bg-white px-5 py-5 shadow-[0_12px_32px_rgba(0,0,0,0.04)]">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.32em] text-neutral-500">
            ATaC Audit UI
          </p>
          <div className="flex items-center justify-between gap-4 max-[640px]:flex-col max-[640px]:items-stretch">
            <h1 className="text-4xl font-black uppercase tracking-tight text-neutral-950">
              流程审计台
            </h1>
            <label className="group relative flex min-h-12 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-none border border-neutral-300 bg-white px-4 text-sm font-bold uppercase tracking-[0.18em] text-neutral-950 transition hover:border-neutral-400 hover:bg-neutral-50">
              <span>{isLoading ? "读取中..." : "选择流程"}</span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleDirectorySelection}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </div>
        </header>

        {status ? (
          <p className="mb-4 rounded-none border border-neutral-300 bg-white px-4 py-3 text-sm leading-6 text-neutral-600">
            {status}
          </p>
        ) : null}

        <Section title="图列表">
          {audits.length === 0 ? (
            <EmptyState>还没有读取到流程。</EmptyState>
          ) : (
            <div className="grid min-w-0 gap-3">
              {audits.map((audit) => {
                const isActive = selectedGraphId === audit.id;
                return (
                  <button
                    key={audit.id}
                    className={[
                      "w-full min-w-0 overflow-hidden rounded-none border px-4 py-3 text-left transition",
                      isActive
                        ? "border-neutral-900 bg-neutral-100 text-neutral-950 shadow-[0_0_0_1px_rgba(0,0,0,0.04)]"
                        : "border-neutral-300 bg-white text-neutral-950 hover:border-neutral-400 hover:bg-neutral-50",
                    ].join(" ")}
                    onClick={() => setSelectedGraphId(audit.id)}
                    type="button"
                  >
                    <strong className="block min-w-0 overflow-hidden text-ellipsis break-words text-sm font-bold uppercase tracking-wide">
                      {audit.id}
                    </strong>
                    <span
                      className={[
                        "mt-2 block min-w-0 max-w-full break-words text-sm leading-6 [overflow-wrap:anywhere]",
                        isActive ? "text-neutral-700" : "text-neutral-600",
                      ].join(" ")}
                    >
                      {audit.description?.description || audit.directory}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="概览">
          {selectedGraph ? (
            <div className="grid gap-3">
              <InspectorRow label="Graph 入口" value={selectedGraph.description?.graph_spec || "-"} />
              <InspectorRow label="目录" value={selectedGraph.directory} />
              <InspectorRow label="状态结构" value={selectedGraph.stateSchema || "-"} />
              <InspectorRow
                label="依赖子代理"
                value={String(selectedGraph.description?.requires_agent ?? false)}
              />
              <InspectorList
                label="流程输入"
                items={formatSchemaItems(selectedGraph.description?.inputs)}
              />
              <InspectorList
                label="流程输出"
                items={formatSchemaItems(selectedGraph.description?.outputs)}
              />
            </div>
          ) : (
            <EmptyState>还没有读取到流程。</EmptyState>
          )}
        </Section>

        <Section title="当前节点">
          {selectedNodeAudit ? (
            <article
              className={[
                "rounded-none border p-4 shadow-[0_20px_50px_rgba(0,0,0,0.24)]",
                nodeCardTone(selectedNodeAudit.kind),
              ].join(" ")}
            >
              <div className="mb-4 flex min-w-0 flex-wrap items-start gap-2">
                <strong className="min-w-0 break-words text-base font-black uppercase tracking-wide text-stone-950">
                  {selectedNodeAudit.id}
                </strong>
                <NodeBadge>{kindLabel(selectedNodeAudit.kind)}</NodeBadge>
                {selectedNodeAudit.isAsync ? <NodeBadge>异步</NodeBadge> : null}
              </div>

              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <MetaBlock
                  label="工具调用"
                  value={selectedNodeAudit.toolCalls.map((item) => item.toolName).join(", ") || "无"}
                />
                <MetaBlock
                  label="代理调用"
                  value={selectedNodeAudit.agentCalls.map((item) => item.agentName).join(", ") || "无"}
                />
              </div>

              <div className="mb-4 rounded-none border border-stone-900/10 bg-white/55 p-4">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-stone-600">
                  节点说明
                </div>
                <p className="m-0 break-words text-sm leading-6 text-stone-800">
                  {selectedNodeAudit.docstring || "未提供节点说明。"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsSourceModalOpen(true)}
                className="w-full rounded-none border border-stone-900/10 bg-white/70 px-4 py-3 text-sm font-bold uppercase tracking-[0.18em] text-stone-700 transition hover:bg-white"
              >
                查看源码
              </button>
            </article>
          ) : (
            <EmptyState>点击节点显示详情。</EmptyState>
          )}
        </Section>
      </aside>

      <main className="min-h-0 min-w-0 overflow-hidden bg-[linear-gradient(180deg,_#ffffff_0%,_#f5f5f5_100%)]">
        {selectedGraph ? (
          <div className="h-full min-h-0 w-full min-w-0">
            <ReactFlow fitView nodes={flow.nodes} edges={flow.edges} onNodeClick={handleNodeClick}>
              <MiniMap
                pannable
                zoomable
                className="!bottom-5 !right-5 !border !border-neutral-300 !bg-white"
              />
              <Controls className="!bottom-5 !left-5 [&>button]:!border-neutral-300 [&>button]:!bg-white [&>button]:!text-neutral-700" />
              <Background color="#d4d4d4" gap={18} />
            </ReactFlow>
          </div>
        ) : (
          <div className="grid h-full place-content-center gap-3 text-center text-neutral-500">
            <h2 className="m-0 text-2xl font-black uppercase tracking-[0.14em] text-neutral-800">
              Welcome
            </h2>
          </div>
        )}
      </main>

      {isSourceModalOpen && selectedNodeAudit ? (
        <div
          className="absolute inset-0 z-50 grid place-items-center bg-black/25 p-6"
          onClick={() => setIsSourceModalOpen(false)}
        >
          <div
            className="flex h-[min(80vh,920px)] w-[min(1100px,100%)] flex-col overflow-hidden rounded-none border border-neutral-300 bg-white shadow-[0_28px_80px_rgba(0,0,0,0.16)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-neutral-500">
                  节点源码
                </div>
                <div className="mt-1 truncate text-lg font-black uppercase tracking-wide text-neutral-950">
                  {selectedNodeAudit.id}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSourceModalOpen(false)}
                className="rounded-none border border-neutral-300 bg-white px-4 py-2 text-sm font-bold uppercase tracking-[0.18em] text-neutral-700 transition hover:bg-neutral-50"
              >
                关闭
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-neutral-50">
              <SyntaxHighlighter
                language="python"
                style={oneLight}
                wrapLongLines
                showLineNumbers
                customStyle={{
                  minHeight: "100%",
                  margin: 0,
                  padding: "1.25rem",
                  background: "#fafafa",
                  fontSize: "0.875rem",
                  lineHeight: "1.75",
                }}
                lineNumberStyle={{
                  color: "#a3a3a3",
                  minWidth: "2.5em",
                  paddingRight: "1rem",
                  userSelect: "none",
                }}
                codeTagProps={{
                  style: {
                    fontFamily: '"Iosevka", "IBM Plex Mono", "SF Mono", monospace',
                  },
                }}
              >
                {selectedNodeAudit.source || "未提取到源码。"}
              </SyntaxHighlighter>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4 rounded-none border border-neutral-300 bg-white p-4 shadow-[0_10px_24px_rgba(0,0,0,0.04)]">
      <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.24em] text-neutral-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="m-0 text-sm leading-6 text-neutral-500">{children}</p>;
}

function InspectorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-4 border-b border-dashed border-neutral-300 pb-3 max-[640px]:flex-col">
      <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-500">
        {label}
      </span>
      <strong className="min-w-0 break-words text-right text-sm font-medium leading-6 text-neutral-900 max-[640px]:text-left">
        {value}
      </strong>
    </div>
  );
}

function MetaBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-none border border-neutral-300 bg-neutral-50 p-3">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-500">{label}</div>
      <p className="m-0 break-words text-sm leading-6 text-neutral-900">{value}</p>
    </div>
  );
}

function InspectorList({
  label,
  items,
}: {
  label: string;
  items: Array<{ name: string; type: string | null; required: string | null }>;
}) {
  return (
    <div className="grid min-w-0 gap-3 border-b border-dashed border-neutral-300 pb-3">
      <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-500">
        {label}
      </span>
      {items.length > 0 ? (
        <div className="grid min-w-0 gap-2">
          {items.map((item) => (
            <div
              key={[item.name, item.type, item.required].filter(Boolean).join("-")}
              className="flex min-w-0 flex-wrap items-center gap-2 border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm leading-6 text-neutral-900"
            >
              <span className="break-words font-medium text-neutral-950">{item.name}</span>
              {item.type ? <FieldTag>{item.type}</FieldTag> : null}
              {item.required ? <FieldTag>{item.required}</FieldTag> : null}
            </div>
          ))}
        </div>
      ) : (
        <strong className="min-w-0 break-words text-sm font-medium leading-6 text-neutral-900">
          -
        </strong>
      )}
    </div>
  );
}

function NodeBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-none border border-black/10 bg-black/5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-800">
      {children}
    </span>
  );
}

function nodeCardTone(kind: string) {
  const mapping: Record<string, string> = {
    logic: "border-neutral-300 bg-white text-neutral-950",
    tool: "border-neutral-300 bg-neutral-100 text-neutral-950",
    agent: "border-neutral-300 bg-neutral-50 text-neutral-950",
    mixed: "border-neutral-300 bg-neutral-200 text-neutral-950",
  };
  return mapping[kind] || "border-neutral-300 bg-white text-neutral-950";
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

function FieldTag({ children }: { children: ReactNode }) {
  return (
    <span className="border border-neutral-300 bg-white px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-600">
      {children}
    </span>
  );
}

function formatSchemaItems(items: Array<Record<string, unknown>> | undefined) {
  if (!items || items.length === 0) return [];

  return items.map((item) => ({
    name: typeof item.name === "string" ? item.name : "-",
    type: typeof item.type === "string" ? item.type : null,
    required: item.required === true ? "必填" : item.required === false ? "可选" : null,
  }));
}

export default App;
