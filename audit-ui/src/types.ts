export interface DescriptionYaml {
  name?: string;
  description?: string;
  graph_spec?: string;
  requires_agent?: boolean;
  inputs?: Array<Record<string, unknown>>;
  outputs?: Array<Record<string, unknown>>;
  example_state?: Record<string, unknown>;
}

export interface AuditToolCall {
  toolName: string | null;
  line: number | null;
}

export interface AuditAgentCall {
  agentName: string;
  line: number | null;
}

export interface AuditNode {
  id: string;
  callable: string | null;
  kind: "logic" | "tool" | "agent" | "mixed";
  isAsync: boolean;
  source: string | null;
  toolCalls: AuditToolCall[];
  agentCalls: AuditAgentCall[];
}

export interface AuditEdge {
  source: string;
  target: string;
}

export interface GraphAuditDocument {
  id: string;
  directory: string;
  sourcePath: string | null;
  entrypoint: string | null;
  graphVariable: string | null;
  stateSchema: string | null;
  description: DescriptionYaml | null;
  nodes: AuditNode[];
  edges: AuditEdge[];
}
