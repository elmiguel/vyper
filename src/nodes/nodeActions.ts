import type { Edge, Node } from '@xyflow/react';
import { NODE_SPECS, nodeId, type EngineNodeData } from './nodeTypes';
import type { MenuItem } from '@/ui/ContextMenu';

type Vec = { x: number; y: number; z: number };
type SetNodes = (updater: Node[] | ((nds: Node[]) => Node[])) => void;
type SetEdges = (updater: Edge[] | ((eds: Edge[]) => Edge[])) => void;

const deepClone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const negVec = (v: Vec): Vec => ({ x: -(v?.x ?? 0), y: -(v?.y ?? 0), z: -(v?.z ?? 0) });
const ZERO: Vec = { x: 0, y: 0, z: 0 };

/** A copied selection held node-locally (separate from the entity clipboard). */
export interface NodeClipboard {
  nodes: Node[];
  edges: Edge[];
}

/** Clone a node set with fresh ids; remaps only edges internal to the set. */
function cloneSubgraph(srcNodes: Node[], srcEdges: Edge[], offset: Vec) {
  const idMap = new Map<string, string>();
  const newNodes: Node[] = srcNodes.map((n) => {
    const id = nodeId();
    idMap.set(n.id, id);
    return {
      ...n,
      id,
      position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
      selected: true,
      data: deepClone(n.data),
    };
  });
  const newEdges: Edge[] = srcEdges
    .filter((e) => idMap.has(e.source) && idMap.has(e.target))
    .map((e) => ({
      ...e,
      id: `e_${nodeId()}`,
      source: idMap.get(e.source)!,
      target: idMap.get(e.target)!,
    }));
  return { newNodes, newEdges };
}

export function deleteNodes(ids: string[], setNodes: SetNodes, setEdges: SetEdges) {
  const set = new Set(ids);
  if (!set.size) return;
  setNodes((nds) => nds.filter((n) => !set.has(n.id)));
  setEdges((eds) => eds.filter((e) => !set.has(e.source) && !set.has(e.target)));
}

export function disconnectNodes(ids: string[], setEdges: SetEdges) {
  const set = new Set(ids);
  setEdges((eds) => eds.filter((e) => !set.has(e.source) && !set.has(e.target)));
}

export function duplicateNodes(
  ids: string[],
  nodes: Node[],
  edges: Edge[],
  setNodes: SetNodes,
  setEdges: SetEdges,
) {
  const set = new Set(ids);
  const src = nodes.filter((n) => set.has(n.id));
  if (!src.length) return;
  const { newNodes, newEdges } = cloneSubgraph(src, edges, { x: 40, y: 40, z: 0 } as Vec);
  setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...newNodes]);
  setEdges((eds) => [...eds, ...newEdges]);
}

export function cloneForClipboard(ids: string[], nodes: Node[], edges: Edge[]): NodeClipboard {
  const set = new Set(ids);
  return {
    nodes: nodes.filter((n) => set.has(n.id)).map((n) => ({ ...n, data: deepClone(n.data) })),
    edges: edges.filter((e) => set.has(e.source) && set.has(e.target)),
  };
}

/** Paste clipboard nodes; if `at` (flow coords) is given the selection's top-left lands there. */
export function pasteClipboard(
  clip: NodeClipboard | null,
  at: { x: number; y: number } | null,
  setNodes: SetNodes,
  setEdges: SetEdges,
) {
  if (!clip?.nodes.length) return;
  const minX = Math.min(...clip.nodes.map((n) => n.position.x));
  const minY = Math.min(...clip.nodes.map((n) => n.position.y));
  const offset: Vec = at ? { x: at.x - minX, y: at.y - minY, z: 0 } : { x: 40, y: 40, z: 0 };
  const { newNodes, newEdges } = cloneSubgraph(clip.nodes, clip.edges, offset);
  setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...newNodes]);
  setEdges((eds) => [...eds, ...newEdges]);
}

export function patchFields(id: string, partial: Record<string, unknown>, setNodes: SetNodes) {
  setNodes((nds) =>
    nds.map((n) => {
      if (n.id !== id) return n;
      const d = n.data as EngineNodeData;
      return { ...n, data: { ...d, fields: { ...d.fields, ...partial } } };
    }),
  );
}

/** The per-node operations a context menu can invoke (bound to the target node). */
export interface NodeMenuOps {
  patch: (partial: Record<string, unknown>) => void;
  duplicate: () => void;
  copy: () => void;
  disconnect: () => void;
  remove: () => void;
}

const MATH_OPS: [string, string][] = [
  ['+', '+'],
  ['−', '-'],
  ['×', '*'],
  ['÷', '/'],
  ['min', 'min'],
  ['max', 'max'],
  ['pow', 'pow'],
  ['mod %', '%'],
];

const KEY_PRESETS: [string, string][] = [
  ['W', 'w'],
  ['A', 'a'],
  ['S', 's'],
  ['D', 'd'],
  ['Space', ' '],
  ['Shift', 'shift'],
  // Runtime compares against e.key.toLowerCase(), so values stay lowercase.
  ['↑ Up', 'arrowup'],
  ['↓ Down', 'arrowdown'],
  ['← Left', 'arrowleft'],
  ['→ Right', 'arrowright'],
];

const PROP_PRESETS = ['health', 'score', 'speed', 'ammo', 'lives'];

/**
 * Builds the full node context menu: type-specific quick-edits up top, then the
 * universal duplicate / copy / disconnect / delete block.
 */
export function nodeMenuItems(node: Node, ops: NodeMenuOps): MenuItem[] {
  const d = node.data as EngineNodeData;
  const spec = NODE_SPECS[d.kind];
  const f = d.fields ?? {};
  const items: MenuItem[] = [];

  const vecField = (id: string) => {
    items.push({
      label: 'Negate vector',
      onClick: () => ops.patch({ [id]: negVec(f[id] as Vec) }),
    });
    items.push({ label: 'Reset to 0', onClick: () => ops.patch({ [id]: { ...ZERO } }) });
    const unit = d.kind === 'action/rotate' ? 90 : 1;
    items.push({
      label: 'Axis preset',
      submenu: (['x', 'y', 'z'] as const).map((axis) => ({
        label: `+${axis.toUpperCase()}`,
        onClick: () => ops.patch({ [id]: { ...ZERO, [axis]: unit } }),
      })),
    });
  };

  switch (d.kind) {
    case 'value/math':
      items.push({
        label: 'Operator',
        submenu: MATH_OPS.map(([lbl, val]) => ({
          label: lbl,
          checked: f.op === val,
          onClick: () => ops.patch({ op: val }),
        })),
      });
      break;
    case 'value/number':
      items.push({
        label: 'Set value',
        submenu: [0, 1, -1, 90, 180, 360].map((v) => ({
          label: String(v),
          checked: f.value === v,
          onClick: () => ops.patch({ value: v }),
        })),
      });
      items.push({ label: 'Negate', onClick: () => ops.patch({ value: -((f.value as number) ?? 0) }) });
      break;
    case 'value/key':
      items.push({
        label: 'Key',
        submenu: KEY_PRESETS.map(([lbl, val]) => ({
          label: lbl,
          checked: f.key === val,
          onClick: () => ops.patch({ key: val }),
        })),
      });
      break;
    case 'action/translate':
    case 'action/rotate':
      items.push({
        label: 'Per second',
        checked: !!f.perSecond,
        onClick: () => ops.patch({ perSecond: !f.perSecond }),
      });
      vecField('by');
      break;
    case 'value/vec3':
      items.push({ label: 'Negate', onClick: () => ops.patch({ value: negVec(f.value as Vec) }) });
      items.push({ label: 'Reset to 0', onClick: () => ops.patch({ value: { ...ZERO } }) });
      items.push({
        label: 'Unit axis',
        submenu: (['x', 'y', 'z'] as const).map((axis) => ({
          label: `+${axis.toUpperCase()}`,
          onClick: () => ops.patch({ value: { ...ZERO, [axis]: 1 } }),
        })),
      });
      break;
    case 'action/setProp':
    case 'value/prop':
      items.push({
        label: 'Property',
        submenu: PROP_PRESETS.map((key) => ({
          label: key,
          checked: f.key === key,
          onClick: () => ops.patch({ key }),
        })),
      });
      break;
    case 'action/setPosition':
      vecField('to');
      break;
  }

  // Universal actions, separated from the quick-edits above.
  const firstCommon = items.length;
  items.push({ label: 'Duplicate', onClick: ops.duplicate });
  items.push({ label: 'Copy', onClick: ops.copy });
  items.push({ label: 'Disconnect all', onClick: ops.disconnect });
  items.push({ label: 'Delete', danger: true, onClick: ops.remove });
  if (firstCommon > 0) items[firstCommon].separator = true;

  // Keep spec referenced so an unknown kind degrades to common actions only.
  void spec;
  return items;
}

/**
 * Bridge so global keyboard shortcuts can drive the focused node canvas.
 * `active` is set while the pointer is over the node editor; `ops` is registered
 * by the mounted NodeEditor. When inactive, shortcuts fall back to entity ops.
 */
export interface NodeShortcutOps {
  remove: () => void;
  duplicate: () => void;
  copy: () => void;
  paste: () => void;
}

class NodeEditorBridge {
  active = false;
  ops: NodeShortcutOps | null = null;

  register(ops: NodeShortcutOps) {
    this.ops = ops;
  }
  unregister(ops: NodeShortcutOps) {
    if (this.ops === ops) {
      this.ops = null;
      this.active = false;
    }
  }
  setActive(v: boolean) {
    this.active = v;
  }
  /** True when keyboard shortcuts should target the node canvas. */
  get engaged() {
    return this.active && !!this.ops;
  }
}

export const nodeEditorBridge = new NodeEditorBridge();
