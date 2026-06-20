import type { Connection, Edge, Node } from '@xyflow/react';
import { NODE_SPECS, type EngineNodeData } from './nodeTypes';

/**
 * Data kind ('bool' | 'number' | …) of a node's port, or null if not found.
 *
 * Handle ids are `in-<portId>`, `out-<portId>` and `exec-<name>`. The prefix is
 * stripped by cutting at the first '-' — NOT a fixed width: "out-" is 4 chars,
 * so the old `slice(3)` turned "out-out" into "-out", which never matched a
 * port and silently rejected every data connection out of an output handle.
 */
export function portKind(node: Node | undefined, handleId: string, dir: 'in' | 'out'): string | null {
  if (!node) return null;
  const spec = NODE_SPECS[(node.data as EngineNodeData).kind];
  if (!spec) return null;
  const portId = handleId.slice(handleId.indexOf('-') + 1);
  const port = (dir === 'in' ? spec.inputs : spec.outputs).find((p) => p.id === portId);
  return port?.kind ?? null;
}

/**
 * Whether a proposed edge is allowed. Exec flow connects only to exec flow
 * (square→square); data ports connect only to a port of the same kind
 * (circle→circle of matching colour). Mixing the two, self-loops, and
 * dangling handles are rejected.
 */
export function canConnect(conn: Connection | Edge, nodes: Node[]): boolean {
  const s = conn.sourceHandle ?? '';
  const t = conn.targetHandle ?? '';
  if (!s || !t || conn.source === conn.target) return false;
  const sExec = s.startsWith('exec-');
  const tExec = t === 'exec-in';
  if (sExec || tExec) return sExec && tExec;
  const srcKind = portKind(nodes.find((n) => n.id === conn.source), s, 'out');
  const tgtKind = portKind(nodes.find((n) => n.id === conn.target), t, 'in');
  // An 'any' input (e.g. Branch's value/compare) accepts any data kind so you can test whatever
  // a node produces — a position, a number, a flag, an object. Other ports stay strictly typed.
  return !!srcKind && (tgtKind === 'any' || srcKind === tgtKind);
}
