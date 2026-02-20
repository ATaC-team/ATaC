import React, { useState, useRef, useCallback } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import { parseTrajectoryToFlow } from './lib/parser';
import { ActionNode, ForLoopNode, IfNode, StartNode } from './components/FlowNodes';
import { EditorPanel } from './components/EditorPanel';

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

  const fileInputRef = useRef<HTMLInputElement>(null);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onUpdateNode = useCallback((updatedNode: Node) => {
    setNodes((nds) => nds.map((n) => (n.id === updatedNode.id ? updatedNode : n)));
    setSelectedNode(updatedNode);
  }, [setNodes]);

  const handleDirectorySelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;

    const loadedFiles: WorkspaceFile[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.name.endsWith('.yaml') || file.name.endsWith('.yml')) {
        const content = await file.text();
        loadedFiles.push({
          name: file.name,
          // webkitRelativePath contains the full relative path
          path: file.webkitRelativePath || file.name,
          content
        });
      }
    }

    // Sort files alphabetically by path
    loadedFiles.sort((a, b) => a.path.localeCompare(b.path));
    setFiles(loadedFiles);
  };

  const handleFileClick = (file: WorkspaceFile) => {
    setSelectedFile(file.path);
    try {
      const { nodes: newNodes, edges: newEdges } = parseTrajectoryToFlow(file.content);
      setNodes(newNodes);
      setEdges(newEdges);
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
                className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white shadow-sm"
              />
            </div>
          </div>

          <div className="w-full h-px bg-gray-200 my-2"></div>

          {/* Directory Loader */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Workspace</h2>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-white border border-gray-300 hover:bg-gray-100 text-gray-800 text-xs py-1 px-3 rounded shadow-sm transition-colors"
              >
                Open Folder
              </button>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleDirectorySelect}
              className="hidden"
              // @ts-expect-error - webkitdirectory is a non-standard attribute but widely supported
              webkitdirectory=""
              directory=""
            />

            <div className="mt-2 bg-white border border-gray-200 rounded overflow-hidden">
              {files.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-xs text-gray-400 italic">No workspace loaded.</p>
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
        </div>
      </div>

      {/* Main Flow Canvas */}
      <div className="flex-1 relative bg-white overflow-hidden">
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
    </div>
  );
}

export default App;
