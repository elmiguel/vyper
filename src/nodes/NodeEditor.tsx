import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { EngineNode } from './EngineNode';
import { FlowEdge } from './FlowEdge';
import { canConnect } from './connectionRules';
import { ASSET_KINDS, NODE_PALETTE, NODE_SPECS, makeNode, type EngineNodeData } from './nodeTypes';
import { ContextMenu, type MenuItem } from '@/ui/ContextMenu';
import {
  cloneForClipboard,
  deleteNodes,
  disconnectNodes,
  duplicateNodes,
  nodeEditorBridge,
  nodeMenuItems,
  pasteClipboard,
  patchFields,
  type NodeClipboard,
} from './nodeActions';
import { useEditorStore } from '@/store/editorStore';

const nodeTypes = { engineNode: EngineNode };
const edgeTypes = { flow: FlowEdge };

/** Custom MIME used to carry a node kind from the palette to the canvas on drop. */
const DND_MIME = 'application/nodeforge-kind';

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

function Flow({ scriptId }: { scriptId: string }) {
  const updateScriptGraph = useEditorStore((s) => s.updateScriptGraph);
  const graph = useEditorStore((s) => s.scripts[scriptId]?.graph);
  const { screenToFlowPosition, fitView } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(graph?.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(graph?.edges ?? []);
  const seededFor = useRef<string>('');
  const [menu, setMenu] = useState<MenuState | null>(null);

  // Latest nodes/edges + node-local clipboard, read by menu + keyboard handlers.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const clipboard = useRef<NodeClipboard | null>(null);

  // Reseed local canvas state only when switching to a different script.
  useEffect(() => {
    if (seededFor.current !== scriptId) {
      seededFor.current = scriptId;
      setNodes(graph?.nodes ?? []);
      setEdges(graph?.edges ?? []);
    }
  }, [scriptId, graph, setNodes, setEdges]);

  // Push canvas edits back to the store (which regenerates code).
  useEffect(() => {
    if (seededFor.current !== scriptId) return;
    const t = setTimeout(() => updateScriptGraph(scriptId, { nodes, edges }), 120);
    return () => clearTimeout(t);
  }, [nodes, edges, scriptId, updateScriptGraph]);

  const isValidConnection = useCallback(
    (conn: Connection | Edge) => {
      const ok = canConnect(conn, nodes);
      // TEMP DIAGNOSTIC — remove once the connection issue is resolved.
      console.warn('[connect] validate', conn.sourceHandle, '→', conn.targetHandle, '=>', ok);
      return ok;
    },
    [nodes],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      // TEMP DIAGNOSTIC — remove once the connection issue is resolved.
      console.warn('[connect] onConnect FIRED', conn.sourceHandle, '→', conn.targetHandle);
      setEdges((eds) => {
        // One connection per target handle (a port takes a single input), but an
        // exec *source* may fan out to many targets — they all run in sequence.
        const filtered = eds.filter((e) => !(e.target === conn.target && e.targetHandle === conn.targetHandle));
        return addEdge({ ...conn, animated: conn.sourceHandle?.startsWith('exec-') }, filtered);
      });
    },
    [setEdges],
  );

  const addNode = useCallback(
    (kind: string, pos?: { x: number; y: number }) => {
      const p = pos ?? { x: 220 + Math.random() * 120, y: 120 + Math.random() * 160 };
      const node = { ...makeNode(kind, p), selected: true };
      setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), node]);
    },
    [setNodes],
  );

  // ----- Drag-and-drop from the palette onto the canvas -----
  const onDragStart = useCallback((e: React.DragEvent, kind: string) => {
    e.dataTransfer.setData(DND_MIME, kind);
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(DND_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const kind = e.dataTransfer.getData(DND_MIME);
      if (!kind || !NODE_SPECS[kind]) return;
      e.preventDefault();
      // Drop at the cursor, nudged so the node body lands under the pointer.
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNode(kind, { x: flow.x - 75, y: flow.y - 16 });
    },
    [screenToFlowPosition, addNode],
  );

  const selectedIds = useCallback(() => nodesRef.current.filter((n) => n.selected).map((n) => n.id), []);

  // Register node ops so global keyboard shortcuts can drive this canvas.
  useEffect(() => {
    const ops = {
      remove: () => deleteNodes(selectedIds(), setNodes, setEdges),
      duplicate: () => duplicateNodes(selectedIds(), nodesRef.current, edgesRef.current, setNodes, setEdges),
      copy: () => {
        const ids = selectedIds();
        if (ids.length) clipboard.current = cloneForClipboard(ids, nodesRef.current, edgesRef.current);
      },
      paste: () => pasteClipboard(clipboard.current, null, setNodes, setEdges),
    };
    nodeEditorBridge.register(ops);
    return () => nodeEditorBridge.unregister(ops);
  }, [setNodes, setEdges, selectedIds]);

  const selectOnly = useCallback(
    (id: string) => setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === id }))),
    [setNodes],
  );

  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: Node) => {
      e.preventDefault();
      const sel = selectedIds();
      // Operate on the whole selection if right-clicking inside it; else just this node.
      let targetIds: string[];
      if (node.selected && sel.length > 1) {
        targetIds = sel;
      } else {
        targetIds = [node.id];
        selectOnly(node.id);
      }
      const ops = {
        patch: (p: Record<string, unknown>) => patchFields(node.id, p, setNodes),
        duplicate: () => duplicateNodes(targetIds, nodesRef.current, edgesRef.current, setNodes, setEdges),
        copy: () => {
          clipboard.current = cloneForClipboard(targetIds, nodesRef.current, edgesRef.current);
        },
        disconnect: () => disconnectNodes(targetIds, setEdges),
        remove: () => deleteNodes(targetIds, setNodes, setEdges),
      };
      setMenu({ x: e.clientX, y: e.clientY, items: nodeMenuItems(node, ops) });
    },
    [selectedIds, selectOnly, setNodes, setEdges],
  );

  const onPaneContextMenu = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      e.preventDefault();
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const items: MenuItem[] = [
        {
          label: 'Add node',
          submenu: NODE_PALETTE.map((group) => ({
            label: group.category,
            submenu: group.items.map((kind) => ({
              label: NODE_SPECS[kind].label,
              onClick: () => addNode(kind, flow),
            })),
          })),
        },
        {
          // Plug-and-play controllers: drop one in and press Play — no wiring needed.
          label: '✨ Add Asset',
          submenu: ASSET_KINDS.map((kind) => ({
            label: NODE_SPECS[kind].label,
            onClick: () => addNode(kind, flow),
          })),
        },
        {
          label: 'Paste',
          separator: true,
          disabled: !clipboard.current,
          onClick: () => pasteClipboard(clipboard.current, flow, setNodes, setEdges),
        },
        { label: 'Select all', onClick: () => setNodes((nds) => nds.map((n) => ({ ...n, selected: true }))) },
        { label: 'Fit view', onClick: () => fitView({ duration: 200 }) },
      ];
      setMenu({ x: e.clientX, y: e.clientY, items });
    },
    [screenToFlowPosition, fitView, addNode, setNodes, setEdges],
  );

  const palette = useMemo(() => NODE_PALETTE, []);

  // Render every edge through the live-flow edge type without writing `type`
  // back into the persisted graph.
  const displayEdges = useMemo(() => edges.map((e) => ({ ...e, type: 'flow' })), [edges]);

  return (
    <div
      className="node-editor"
      onPointerEnter={() => nodeEditorBridge.setActive(true)}
      onPointerLeave={() => nodeEditorBridge.setActive(false)}
    >
      <div className="node-palette">
        {palette.map((group) => (
          <div className="palette-group" key={group.category}>
            <div className={`palette-cat cat-${group.category}`}>{group.category}</div>
            {group.items.map((kind) => (
              <button
                key={kind}
                className="palette-item"
                draggable
                onDragStart={(e) => onDragStart(e, kind)}
                onClick={() => addNode(kind)}
                title="Click to add, or drag onto the canvas"
              >
                {NODE_SPECS[kind].label}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="node-canvas" onDragOver={onDragOver} onDrop={onDrop}>
        <ReactFlow
          nodes={nodes}
          edges={displayEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeContextMenu={onNodeContextMenu}
          onPaneContextMenu={onPaneContextMenu}
          isValidConnection={isValidConnection}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: 'flow' }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.4} color="#1b2b5a" />
          <Controls />
          <MiniMap pannable zoomable nodeColor={(n) => NODE_SPECS[(n.data as EngineNodeData).kind]?.color ?? '#888'} />
        </ReactFlow>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}

export function NodeEditor({ scriptId }: { scriptId: string }) {
  return (
    <ReactFlowProvider>
      <Flow scriptId={scriptId} />
    </ReactFlowProvider>
  );
}
