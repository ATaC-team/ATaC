// @ts-nocheck
import type { Node } from '@xyflow/react';

interface EditorPanelProps {
    node: Node | null;
    onUpdateNode: (node: Node) => void;
    onClose: () => void;
}

export const EditorPanel = ({ node, onUpdateNode, onClose }: EditorPanelProps) => {
    if (!node) return null;

    const handleDataChange = (key: string, value: string) => {
        onUpdateNode({
            ...node,
            data: {
                ...node.data,
                [key]: value
            }
        });
    };

    const renderFields = () => {
        switch (node.type) {
            case 'action':
                return (
                    <>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-500 uppercase">Action URL</label>
                            <input
                                type="text"
                                value={(node.data.action as string) || ''}
                                onChange={(e) => handleDataChange('action', e.target.value)}
                                className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded focus:border-blue-500 focus:outline-none bg-white"
                            />
                        </div>
                        {/* Minimal example for args, in a real scenario we'd need a JSON editor or key-value list */}
                        <div className="space-y-1 mt-4">
                            <label className="text-xs font-semibold text-gray-500 uppercase">Arguments (JSON)</label>
                            <textarea
                                value={JSON.stringify(node.data.args || {}, null, 2)}
                                onChange={(e) => {
                                    try {
                                        const parsed = JSON.parse(e.target.value);
                                        handleDataChange('args', parsed);
                                    } catch (err) {
                                        // Ignore transient JSON errors while typing
                                    }
                                }}
                                rows={5}
                                className="w-full text-xs font-mono px-2 py-1.5 border border-gray-300 rounded focus:border-blue-500 focus:outline-none bg-gray-50"
                            />
                        </div>
                    </>
                );
            case 'forLoop':
                return (
                    <>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-500 uppercase">Input Expression (in)</label>
                            <input
                                type="text"
                                value={(node.data.inExpr as string) || ''}
                                onChange={(e) => handleDataChange('inExpr', e.target.value)}
                                className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded font-mono bg-white"
                            />
                        </div>
                        <div className="space-y-1 mt-4">
                            <label className="text-xs font-semibold text-gray-500 uppercase">Iterator Item Name</label>
                            <input
                                type="text"
                                value={(node.data.item as string) || ''}
                                onChange={(e) => handleDataChange('item', e.target.value)}
                                className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded font-mono bg-white"
                            />
                        </div>
                    </>
                );
            default:
                return (
                    <div className="text-sm text-gray-500 italic">No specific editor for this node type.</div>
                );
        }
    };

    return (
        <div className="w-80 border-l border-gray-200 bg-gray-50 flex flex-col h-full absolute right-0 top-0 shadow-xl z-10 transition-transform bg-white/95 backdrop-blur">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-bold text-gray-800">Edit Node</h2>
                    <p className="text-[10px] text-gray-500 font-mono mt-0.5">{node.id}</p>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-800 p-1">
                    ✕
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {renderFields()}
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50">
                <button className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded transition-colors shadow-sm">
                    Save Changes
                </button>
                <p className="text-[10px] text-center text-gray-400 mt-2">Saving currently only updates the UI canvas.</p>
            </div>
        </div>
    );
};
