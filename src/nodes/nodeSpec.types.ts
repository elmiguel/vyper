export type DataKind = 'number' | 'vec3' | 'string' | 'bool' | 'entity' | 'any';
export type NodeCategory = 'event' | 'action' | 'value' | 'physics' | 'assets' | 'objective' | 'fx' | 'camera' | 'world' | 'trigger';

export interface PortSpec {
  id: string;
  label: string;
  kind: DataKind;
  /** Default literal used when the port is unconnected. */
  default?: number | string | boolean | { x: number; y: number; z: number };
  /** Opt into a specialised inline editor instead of the default per-kind one. */
  editor?: 'keycapture' | 'objective';
}

export interface NodeSpec {
  kind: string;
  label: string;
  category: NodeCategory;
  color: string;
  /** Has an execution input (flow target). Events don't. */
  execIn: boolean;
  /** Named execution outputs (flow sources). Empty for pure value nodes. */
  execOuts: string[];
  inputs: PortSpec[];
  outputs: PortSpec[];
  /** Extra inline fields edited on the node body (e.g. math op, prop key). */
  fields?: PortSpec[];
}

export interface EngineNodeData extends Record<string, unknown> {
  kind: string;
  fields: Record<string, number | string | boolean | { x: number; y: number; z: number }>;
}
