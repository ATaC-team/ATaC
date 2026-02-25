import React, { useState, useCallback, useEffect } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import { parseTrajectoryToFlow } from './lib/parser';
import type { TrajectoryInput } from './lib/parser';
import { ActionNode, ForLoopNode, IfNode, StartNode } from './components/FlowNodes';
import { EditorPanel } from './components/EditorPanel';
import yaml from 'js-yaml';

const nodeTypes = {
  action: ActionNode,
  forLoop: ForLoopNode,
  ifCondition: IfNode,
  trajectoryStart: StartNode
};

interface WorkspaceFile {
  name: string;
  path: string;
  content: string;
}

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const [trajInputs, setTrajInputs] = useState<TrajectoryInput[]>([]);
  const [trajVariables, setTrajVariables] = useState<any>({});

  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [mcpConfigPath, setMcpConfigPath] = useState<string>('');
  const [workspacePath, setWorkspacePath] = useState<string>('');

  const [isRunning, setIsRunning] = useState(false);
  const [runOutput, setRunOutput] = useState<string | null>(null);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const handleLoadWorkspace = useCallback(async (pathoverride?: string) => {
    const targetPath = pathoverride || workspacePath;
    if (!targetPath) return;
    try {
      setIsLoadingWorkspace(true);
      const res = await fetch(`/api/workspace?path=${encodeURIComponent(targetPath)}`);
      if (!res.ok) {
        const text = await res.text();
        let err;
        try { err = JSON.parse(text); } catch (e) { err = { error: text }; }
        throw new Error(err.error || 'Failed to load workspace');
      }
      const data = await res.json();

      const loadedFiles = data.files as WorkspaceFile[];
      loadedFiles.sort((a, b) => a.path.localeCompare(b.path));
      setFiles(loadedFiles);

      // Auto-select if a single file was directly passed
      if (data.type === 'file' && loadedFiles.length === 1) {
        handleFileClick(loadedFiles[0]);
      } else if (data.type === 'directory' && loadedFiles.length > 0) {
        // Optional: Auto open the first index.yaml if available
        const indexFile = loadedFiles.find(f => f.name === 'index.yaml' || f.name === 'index.json');
        if (indexFile) {
          handleFileClick(indexFile);
        }
      }
    } catch (err: any) {
      alert("Error loading workspace/file: " + err.message);
    } finally {
      setIsLoadingWorkspace(false);
    }
  }, [workspacePath]); // handleFileClick is stable enough since it's just updating state

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const config = await res.json();
          let shouldTriggerLoad = false;
          let newWorkspacePath = workspacePath;

          if (config.mcpConfigPath && !mcpConfigPath) {
            setMcpConfigPath(config.mcpConfigPath);
          }
          if (config.workspaceDir && !workspacePath) {
            const defaultAtacPath = config.workspaceDir + '/.atac';
            setWorkspacePath(defaultAtacPath);
            newWorkspacePath = defaultAtacPath;
            shouldTriggerLoad = true;
          }

          if (shouldTriggerLoad && newWorkspacePath) {
            handleLoadWorkspace(newWorkspacePath);
          }
        }
      } catch (err) {
        console.error("Failed to fetch initial ATaC config", err);
      }
    };
    fetchConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onUpdateNode = useCallback((updatedNode: Node) => {
    setNodes((nds) => nds.map((n) => (n.id === updatedNode.id ? updatedNode : n)));
    setSelectedNode(updatedNode);
  }, [setNodes]);



  const handleFileClick = (file: WorkspaceFile) => {
    setSelectedFile(file.path);
    try {
      const { nodes: newNodes, edges: newEdges, inputs, variables } = parseTrajectoryToFlow(file.content);
      setNodes(newNodes);
      setEdges(newEdges);
      setTrajInputs(inputs);
      setTrajVariables(variables);
      setSelectedNode(null);

      // Use saved inputValues if they exist for these inputs, otherwise use default
      const defaultVals: Record<string, string> = { ...inputValues };
      inputs.forEach(inp => {
        if (defaultVals[inp.name] === undefined) {
          defaultVals[inp.name] = (inp.type === 'list' || inp.type === 'dict')
            ? JSON.stringify(inp.default, null, 2)
            : String(inp.default || '');
        }
      });
      setInputValues(defaultVals);
      setRunOutput(null);
    } catch (err) {
      console.error("Failed to parse YAML or generate flow:", err);
      alert("Error parsing trajectory file. Check console for details.");
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-gray-900 font-mono">
      {/* Sidebar */}
      <div className="w-80 border-r border-gray-200 bg-gray-50 flex flex-col h-full">
        <div className="p-4 border-b border-gray-200 bg-white">
          <h1 className="text-xl font-bold tracking-tight">ATaC Builder</h1>
          <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider">Trajectory Editor</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* MCP Config Section */}
          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Configuration</h2>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">MCP Server ConfigsPath</label>
              <input
                type="text"
                placeholder="/path/to/mcp_config.json"
                value={mcpConfigPath}
                onChange={e => setMcpConfigPath(e.target.value)}
                className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white shadow-sm"
              />
            </div>
          </div>

          <div className="w-full h-px bg-gray-200 my-2"></div>

          {/* Directory Loader */}
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700 block">Workspace / File Path</label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="/Users/... or relative path"
                  value={workspacePath}
                  onChange={e => setWorkspacePath(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLoadWorkspace(workspacePath)}
                  className="flex-1 text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white shadow-sm"
                />
                <button
                  onClick={() => handleLoadWorkspace(workspacePath)}
                  disabled={isLoadingWorkspace}
                  className="bg-gray-800 hover:bg-gray-900 text-white text-xs py-1.5 px-3 rounded shadow-sm transition-colors disabled:bg-gray-400"
                >
                  {isLoadingWorkspace ? '...' : 'Load'}
                </button>
              </div>
            </div>

            <div className="mt-2 bg-white border border-gray-200 rounded overflow-hidden">
              {files.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-xs text-gray-400 italic">No files loaded.</p>
                </div>
              ) : (
                <ul className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                  {files.map((file) => (
                    <li key={file.path}>
                      <button
                        onClick={() => handleFileClick(file)}
                        className={`w-full text-left px-3 py-2 text-xs truncate transition-colors ${selectedFile === file.path
                          ? 'bg-blue-50 text-blue-700 font-medium border-l-2 border-blue-500'
                          : 'hover:bg-gray-50 text-gray-700 border-l-2 border-transparent'
                          }`}
                        title={file.path}
                      >
                        {file.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Trajectory Runner Section */}
          {selectedFile && (
            <div className="space-y-4 pt-2">
              <div className="w-full h-px bg-gray-200 border-none"></div>

              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Runner</h2>
              </div>

              {trajInputs.length > 0 && (
                <div className="space-y-3 bg-white p-3 border border-gray-200 rounded shadow-sm">
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase">Input Parameters</h3>
                  {trajInputs.map(inp => (
                    <div key={inp.name} className="space-y-1">
                      <label className="text-xs font-medium text-gray-700 block">
                        {inp.name} <span className="text-gray-400 font-normal text-[10px]">({inp.type})</span>
                      </label>
                      {inp.type === 'list' || inp.type === 'dict' ? (
                        <textarea
                          className="w-full text-xs font-mono px-2 py-1.5 border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          rows={4}
                          value={inputValues[inp.name] || ''}
                          onChange={e => setInputValues({ ...inputValues, [inp.name]: e.target.value })}
                        />
                      ) : (
                        <input
                          type="text"
                          className="w-full text-xs font-mono px-2 py-1.5 border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          value={inputValues[inp.name] || ''}
                          onChange={e => setInputValues({ ...inputValues, [inp.name]: e.target.value })}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {Object.keys(trajVariables).length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase">Initial Variables</h3>
                  <pre className="text-[10px] bg-gray-100 p-2 rounded border border-gray-200 text-gray-700 max-h-32 overflow-y-auto">
                    {JSON.stringify(trajVariables, null, 2)}
                  </pre>
                </div>
              )}

              <button
                disabled={isRunning}
                onClick={async () => {
                  try {
                    setIsRunning(true);
                    setRunOutput("Starting execution...");

                    const fileObj = files.find(f => f.path === selectedFile);
                    if (!fileObj) throw new Error("File not found");

                    // Rewrite inputs into the YAML
                    const doc = yaml.load(fileObj.content) as any;
                    if (doc.inputs && Array.isArray(doc.inputs)) {
                      doc.inputs.forEach((inp: any) => {
                        if (inputValues[inp.name] !== undefined) {
                          if (inp.type === 'list' || inp.type === 'dict') {
                            try { inp.default = JSON.parse(inputValues[inp.name]); } catch (e) { }
                          } else {
                            inp.default = inputValues[inp.name];
                          }
                        }
                      });
                    }

                    const newYaml = yaml.dump(doc);

                    const res = await fetch('/api/run', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ yamlContent: newYaml, mcpConfigPath })
                    });

                    const text = await res.text();
                    let result;
                    try {
                      result = JSON.parse(text);
                    } catch (e) {
                      throw new Error("Server returned non-JSON response: " + text.substring(0, 100));
                    }

                    if (!res.ok) {
                      throw new Error(result.error || "Unknown server error");
                    }

                    setRunOutput(result.output || result.error || "Execution finished with no output.");
                  } catch (e: any) {
                    setRunOutput("Error: " + e.message);
                  } finally {
                    setIsRunning(false);
                  }
                }}
                className={`w-full mt-2 text-white text-sm font-bold py-2.5 rounded shadow transition-all active:scale-[0.98] flex justify-center items-center space-x-2 ${isRunning ? 'bg-gray-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                <span>{isRunning ? 'Running...' : '▶ Run Trajectory'}</span>
              </button>
            </div>
          )}
        </div>
      </div>


      {/* Main Flow Canvas & Output */}
      <div className="flex-1 flex flex-col relative bg-white overflow-hidden">
        <div className={`relative ${runOutput !== null ? 'h-2/3' : 'h-full'}`}>
          {selectedFile ? (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypes}
              onPaneClick={() => setSelectedNode(null)}
              fitView
            >
              <Background color="#ccc" gap={16} />
              <Controls />
            </ReactFlow>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Select a trajectory file from the workspace to visualize.
            </div>
          )}

          {/* Editor Panel Overlay */}
          <EditorPanel
            node={selectedNode}
            onUpdateNode={onUpdateNode}
            onClose={() => setSelectedNode(null)}
          />
        </div>

        {runOutput !== null && (
          <div className="h-1/3 border-t border-gray-200 bg-gray-900 text-green-400 p-4 font-mono text-xs overflow-y-auto flex flex-col relative shadow-inner">
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-700 top-0 sticky bg-gray-900 z-10">
              <span className="font-bold text-gray-300 uppercase tracking-wider">Terminal Output</span>
              <button onClick={() => setRunOutput(null)} className="text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-800">✕ Close</button>
            </div>
            <pre className="whitespace-pre-wrap flex-1 leading-relaxed">{runOutput}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
