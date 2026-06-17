import { Box, Frame, Undo2, Redo2, Scissors, Slice, PenTool, Spline, Minus, Plus } from 'lucide-react';
import { useModelerStore } from './modelerStore';
import type { KernelPrimitive } from '@/kernel/primitives';

const PRIMITIVES: Array<{ kind: KernelPrimitive; label: string }> = [
  { kind: 'cube', label: 'Cube' },
  { kind: 'plane', label: 'Plane' },
  { kind: 'grid', label: 'Grid' },
  { kind: 'cylinder', label: 'Cylinder' },
  { kind: 'sphere', label: 'Sphere' },
  { kind: 'cone', label: 'Cone' },
  { kind: 'torus', label: 'Torus' },
];

/**
 * The Modeling Studio's tool panel — kernel-driven, with no game-editor coupling. It
 * spawns primitives, reports the selection, runs modeling operators (extrude / connect /
 * bridge / loop cut / knife), and drives undo/redo against the kernel's command stack.
 * The contextual operators follow the active component mode (face/vertex/edge).
 */
export function ModelerTools() {
  const selection = useModelerStore((s) => s.selection);
  const faceCount = useModelerStore((s) => s.faceCount);
  const component = useModelerStore((s) => s.component);
  const editTool = useModelerStore((s) => s.editTool);
  const canUndo = useModelerStore((s) => s.canUndo);
  const canRedo = useModelerStore((s) => s.canRedo);
  const addPrimitive = useModelerStore((s) => s.addPrimitive);
  const group = useModelerStore((s) => s.group);
  const ungroup = useModelerStore((s) => s.ungroup);
  useModelerStore((s) => s.activeRevision); // re-render when grouping/focus changes
  const selectionGrouped = useModelerStore((s) => s.selectionGrouped)();
  const extrude = useModelerStore((s) => s.extrude);
  const connect = useModelerStore((s) => s.connect);
  const bridge = useModelerStore((s) => s.bridge);
  const selectLoop = useModelerStore((s) => s.selectLoop);
  const setEditTool = useModelerStore((s) => s.setEditTool);
  const retopoResolution = useModelerStore((s) => s.retopoResolution);
  const setRetopoResolution = useModelerStore((s) => s.setRetopoResolution);
  const clearSelection = useModelerStore((s) => s.clearSelection);
  const requestFrame = useModelerStore((s) => s.requestFrame);
  const undo = useModelerStore((s) => s.undo);
  const redo = useModelerStore((s) => s.redo);

  const noun = component === 'object' ? 'face' : component;

  return (
    <div className="panel modeling-tools">
      <div className="panel-head">Modeling</div>
      <div className="panel-scroll">
        <div className="studio-section">
          <div className="studio-label"><Box size={13} /> New mesh</div>
          <div className="studio-grid">
            {PRIMITIVES.map((p) => (
              <button key={p.kind} className="studio-btn" onClick={() => addPrimitive(p.kind)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="empty-hint inline">Adds a primitive beside the current model.</div>
        </div>

        <div className="studio-section">
          <div className="studio-label">Edit ({noun}s)</div>
          <div className="studio-hint">{selection.length} of {component === 'face' || component === 'object' ? faceCount : '—'} {noun}(s) selected</div>
          <div className="studio-grid">
            {(component === 'face' || component === 'object') && (
              <button className="studio-btn" disabled={selection.length === 0} onClick={() => extrude(0.5)}>extrude</button>
            )}
            {component === 'vertex' && (
              <button className="studio-btn" disabled={selection.length < 2} onClick={() => connect()}>connect</button>
            )}
            {component === 'edge' && (
              <button className="studio-btn" disabled={selection.length < 2} onClick={() => bridge()}>bridge</button>
            )}
            {component === 'object' && (
              <>
                <button
                  className="studio-btn"
                  title="Group the selected objects so they focus/move as one (⌘/Ctrl+G)"
                  disabled={selection.length === 0}
                  onClick={() => group()}
                >
                  group
                </button>
                <button
                  className="studio-btn"
                  title="Ungroup the selected object (⇧⌘/Ctrl+G)"
                  disabled={!selectionGrouped}
                  onClick={() => ungroup()}
                >
                  ungroup
                </button>
              </>
            )}
            {component !== 'object' && (
              <button
                className="studio-btn"
                title="L — select the loop through the selection (edge: one selected edge; vertex/face: two adjacent anchors)"
                disabled={component === 'edge' ? selection.length < 1 : selection.length < 2}
                onClick={() => selectLoop()}
              >
                loop (L)
              </button>
            )}
            <button className="studio-btn" disabled={selection.length === 0} onClick={() => clearSelection()}>clear</button>
          </div>
          <div className="empty-hint inline">
            {component === 'vertex' && 'Connect: 2 verts on a face → edge. Loop: select 2 verts, then Loop (L) — selects the loop, or the path between them.'}
            {component === 'edge' && 'Bridge two edge loops to join them. Double-click an edge (or Loop/L) selects its loop.'}
            {component === 'object' && 'Click an object to focus it (others dim + lock in edit modes). Shift-click several, then Group to focus/move them as one.'}
            {component === 'face' && 'Click faces (Shift to add), then extrude. Loop: select 2 faces, then Loop (L) — selects the loop, or the path between them.'}
          </div>
        </div>

        <div className="studio-section">
          <div className="studio-label"><Scissors size={13} /> Tools</div>
          <div className="studio-grid">
            <button
              className={`studio-btn ${editTool === 'loopcut' ? 'active' : ''}`}
              onClick={() => setEditTool('loopcut')}
            >
              <Slice size={12} /> loop cut
            </button>
            <button
              className={`studio-btn ${editTool === 'knife' ? 'active' : ''}`}
              onClick={() => setEditTool('knife')}
            >
              <Scissors size={12} /> knife
            </button>
            <button
              className={`studio-btn ${editTool === 'drawpoly' ? 'active' : ''}`}
              onClick={() => setEditTool('drawpoly')}
            >
              <PenTool size={12} /> draw poly
            </button>
            <button
              className={`studio-btn ${editTool === 'sketchtopo' ? 'active' : ''}`}
              onClick={() => setEditTool('sketchtopo')}
            >
              <Spline size={12} /> sketch retopo
            </button>
          </div>
          {editTool === 'loopcut' && <div className="empty-hint inline">Hover an edge to preview the loop, click to cut.</div>}
          {editTool === 'knife' && <div className="empty-hint inline">Click along edges to trace a cut; right-click to finish.</div>}
          {editTool === 'drawpoly' && <div className="empty-hint inline">Click on the ground to place points; right-click to close the face.</div>}
          {editTool === 'sketchtopo' && (
            <>
              <div className="empty-hint inline">
                Draw strokes over the surface; four strokes that enclose a region fill with quads. Press Enter to commit the cage.
              </div>
              <div className="studio-row">
                <span className="studio-label">grid {retopoResolution}×{retopoResolution}</span>
                <button className="studio-btn" title="Fewer subdivisions" onClick={() => setRetopoResolution(retopoResolution - 1)}>
                  <Minus size={12} />
                </button>
                <button className="studio-btn" title="More subdivisions" onClick={() => setRetopoResolution(retopoResolution + 1)}>
                  <Plus size={12} />
                </button>
              </div>
            </>
          )}
        </div>

        <div className="studio-section">
          <div className="studio-label">View &amp; history</div>
          <div className="studio-grid">
            <button className="studio-btn" onClick={() => requestFrame()}><Frame size={12} /> frame</button>
            <button className="studio-btn" disabled={!canUndo} onClick={() => undo()}><Undo2 size={12} /> undo</button>
            <button className="studio-btn" disabled={!canRedo} onClick={() => redo()}><Redo2 size={12} /> redo</button>
          </div>
        </div>
      </div>
    </div>
  );
}
