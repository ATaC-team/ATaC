// @ts-nocheck
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

const BaseNode = ({ data, selected, title, typeColor, typeBg, children }: any) => {
    return (
        <div className={`min-w-[250px] bg-white rounded-lg shadow-sm border-2 transition-all ${selected ? 'border-blue-500 shadow-md scale-[1.02]' : 'border-gray-200'} overflow-hidden`}>
            <Handle type="target" position={Position.Top} className="!bg-gray-400 !w-3 !h-3" />

            <div className={`px-3 py-2 border-b border-gray-100 flex items-center justify-between ${typeBg}`}>
                <span className={`text-xs font-bold uppercase tracking-wider ${typeColor}`}>{title}</span>
                {data.stepId && <span className="text-[10px] text-gray-400 font-mono bg-white/50 px-1.5 py-0.5 rounded">id: {data.stepId}</span>}
            </div>

            <div className="p-3 text-sm text-gray-700 font-mono space-y-2">
                {children}
            </div>

            <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !w-3 !h-3" />
        </div>
    );
};

export const ActionNode = (props: NodeProps) => {
    const { action, args } = props.data as any;
    return (
        <BaseNode {...props} title="Action" typeColor="text-blue-700" typeBg="bg-blue-50">
            <div className="font-semibold text-gray-900 border border-blue-100 bg-white px-2 py-1 rounded text-xs truncate" title={action}>
                {action || 'No Action URL'}
            </div>
            {args && Object.keys(args).length > 0 && (
                <div className="text-xs space-y-1">
                    {Object.entries(args).map(([k, v]) => (
                        <div key={k} className="flex flex-col">
                            <span className="text-gray-400 text-[10px]">{k}:</span>
                            <span className="text-gray-600 truncate bg-gray-50 px-1 py-0.5 rounded border border-gray-100">{String(v)}</span>
                        </div>
                    ))}
                </div>
            )}
        </BaseNode>
    );
};

export const ForLoopNode = (props: NodeProps) => {
    const { inExpr, item } = props.data as any;
    return (
        <BaseNode {...props} title="For Loop" typeColor="text-fuchsia-700" typeBg="bg-fuchsia-50">
            <div className="grid grid-cols-3 gap-2 text-xs">
                <span className="text-gray-400">in:</span>
                <span className="col-span-2 text-gray-800 bg-gray-50 px-1 py-0.5 rounded truncate" title={inExpr}>{inExpr}</span>

                <span className="text-gray-400">item:</span>
                <span className="col-span-2 text-gray-800 bg-gray-50 px-1 py-0.5 rounded truncate" title={item}>{item}</span>
            </div>
        </BaseNode>
    );
};

export const IfNode = (props: NodeProps) => {
    const { condition } = props.data as any;
    return (
        <BaseNode {...props} title="If Condition" typeColor="text-amber-700" typeBg="bg-amber-50">
            <div className="text-xs">
                <span className="text-gray-400 block mb-1">condition:</span>
                <span className="text-gray-800 bg-gray-50 px-1 py-0.5 rounded block truncate" title={condition}>{condition}</span>
            </div>
        </BaseNode>
    );
};

export const StartNode = (props: NodeProps) => {
    const { name, desc } = props.data as any;
    return (
        <div className={`min-w-[200px] bg-emerald-50 rounded-full shadow-sm border-2 ${props.selected ? 'border-emerald-500' : 'border-emerald-200'} px-6 py-3 text-center`}>
            <div className="text-emerald-800 font-bold tracking-tight text-sm">{name || 'Trajectory Start'}</div>
            {desc && <div className="text-emerald-600 text-xs mt-1 opacity-80">{desc}</div>}
            <Handle type="source" position={Position.Bottom} className="!bg-emerald-500 !w-3 !h-3 opacity-0" />
        </div>
    );
};
