import { useState } from 'react';
import { Box, Pencil, Save } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import { getManager } from '@/babylon/engine';
import { toCustomGeometry } from '@/babylon/customMesh';
import { buildEditPrimitive, type EditPrimitiveKind } from '@/babylon/editmesh/primitives';
import { ModelingPanel } from '@/panels/ModelingPanel';
import type { MeshEditController } from '@/babylon/MeshEditController';
import { defaultSculptBrush, type CustomGeometry, type SculptBrushMode } from '@/types';
import type { MeshComponentMode } from '@/store/editorTypes';

const PRIMITIVES: Array<{ kind: EditPrimitiveKind; label: string }> = [
  { kind: 'box', label: 'Box' },
  { kind: 'plane', label: 'Plane' },
  { kind: 'grid', label: 'Grid' },
  { kind: 'cylinder', label: 'Cylinder' },
];

const COMPONENTS: MeshComponentMode[] = ['vertex', 'edge', 'face'];

/** Operators grouped by the component type they need; disabled otherwise. */
const FACE_OPS = ['extrude', 'inset', 'subdivide', 'delete'] as const;
const EDGE_OPS = ['bevel', 'loopcut'] as const;

const SCULPT_BRUSHES: SculptBrushMode[] = ['draw', 'inflate', 'smooth', 'flatten', 'grab', 'pinch'];

/**
 * The Modeling Studio tools panel: spawn editable primitives, enter polygon Edit Mode
 * (vertex/edge/face) and run modeling operators, combine meshes with CSG booleans, and
 * save creations to the asset library. Reactive state lives in the store's `meshEdit`
 * slice; modeling operators are issued imperatively to the scene's MeshEditController.
 */
export function ModelingTools() {
  const entities = useEditorStore((s) => s.entities);
  const selectedId = useEditorStore((s) => s.selectedId);
  const mode = useEditorStore((s) => s.mode);
  const meshEdit = useEditorStore((s) => s.meshEdit);
  const beginMeshEdit = useEditorStore((s) => s.beginMeshEdit);
  const endMeshEdit = useEditorStore((s) => s.endMeshEdit);
  const setMeshComponent = useEditorStore((s) => s.setMeshComponent);
  const setMeshSculptBrush = useEditorStore((s) => s.setMeshSculptBrush);
  const setMeshTool = useEditorStore((s) => s.setMeshTool);
  const addCustomMesh = useEditorStore((s) => s.addCustomMesh);
  const saveMeshToLibrary = useEditorStore((s) => s.saveMeshToLibrary);

  const [status, setStatus] = useState<string>('');

  const selected = entities.find((e) => e.id === selectedId);
  const is3d = mode === '3d';
  // Edit Mode targets buildable geometry (primitives + baked custom meshes), not
  // terrain/loaded models/lights.
  const editableKinds = new Set(['box', 'sphere', 'ground', 'plane', 'cylinder', 'cone', 'custom']);
  const canEdit = is3d && !!selected?.mesh && editableKinds.has(selected.mesh.kind);
  const editing = meshEdit.active && meshEdit.entityId === selectedId;

  const spawn = (kind: EditPrimitiveKind) => {
    const geo = buildEditPrimitive(kind).toGeometry();
    addCustomMesh(geo, kind[0].toUpperCase() + kind.slice(1));
  };

  const op = (name: string) => getManager()?.meshEditController?.applyOp(name as never);
  /** Run a selection action against the live Edit-Mode controller. */
  const sel = (fn: (c: MeshEditController) => void) => {
    const c = getManager()?.meshEditController;
    if (c) fn(c);
  };

  const sculpt = meshEdit.sculpt;
  const patchBrush = (patch: Partial<NonNullable<typeof sculpt>>) =>
    setMeshSculptBrush({ ...(sculpt ?? defaultSculptBrush()), ...patch });

  const geometryOf = (): CustomGeometry | null => {
    if (selected?.mesh?.custom) return selected.mesh.custom;
    const mesh = selectedId ? getManager()?.getMesh(selectedId) : undefined;
    return mesh ? toCustomGeometry(mesh) : null;
  };

  const save = () => {
    const geo = geometryOf();
    if (!geo) {
      setStatus('Nothing to save — select a mesh.');
      return;
    }
    saveMeshToLibrary(selected?.name || 'Mesh', geo);
    setStatus(`Saved “${selected?.name || 'Mesh'}” to the asset library.`);
  };

  return (
    <div className="panel modeling-tools">
      <div className="panel-head">Modeling</div>
      <div className="panel-scroll">
        {!is3d && <div className="empty-hint">Modeling tools are available in 3D mode.</div>}

        <div className="studio-section">
          <div className="studio-label">
            <Box size={13} /> Add primitive
          </div>
          <div className="studio-grid">
            {PRIMITIVES.map((p) => (
              <button key={p.kind} className="studio-btn" disabled={!is3d} onClick={() => spawn(p.kind)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="studio-section">
          <div className="studio-label">
            <Pencil size={13} /> Edit mode
          </div>
          <button
            className={`studio-btn wide ${editing ? 'active' : ''}`}
            disabled={!canEdit}
            onClick={() => (editing ? endMeshEdit() : selectedId && beginMeshEdit(selectedId))}
          >
            {editing ? 'Exit Edit Mode' : 'Enter Edit Mode'}
          </button>
          {!canEdit && is3d && <div className="empty-hint inline">Select a primitive or custom mesh.</div>}

          {editing && (
            <>
              <div className="studio-segmented">
                {COMPONENTS.map((c) => (
                  <button
                    key={c}
                    className={meshEdit.component === c ? 'active' : ''}
                    onClick={() => setMeshComponent(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="studio-hint">{meshEdit.selection.length} {meshEdit.component}(s) selected</div>
              <div className="studio-grid">
                <button className="studio-btn" onClick={() => sel((c) => c.selectAllComponents())}>select all</button>
                <button className="studio-btn" onClick={() => sel((c) => c.growSelection())}>grow</button>
                <button className="studio-btn" onClick={() => sel((c) => c.shrinkSelection())}>shrink</button>
                <button className="studio-btn" disabled={meshEdit.component !== 'edge'} onClick={() => sel((c) => c.selectEdgeLoop())}>loop</button>
                <button className="studio-btn" disabled={meshEdit.component !== 'edge'} onClick={() => sel((c) => c.selectEdgeRing())}>ring</button>
                <button className="studio-btn" onClick={() => sel((c) => c.frameSelection())}>frame</button>
              </div>
              <div className="studio-grid">
                {FACE_OPS.map((o) => (
                  <button
                    key={o}
                    className="studio-btn"
                    disabled={meshEdit.component !== 'face'}
                    onClick={() => op(o)}
                  >
                    {o}
                  </button>
                ))}
                {EDGE_OPS.map((o) => (
                  <button
                    key={o}
                    className="studio-btn"
                    disabled={meshEdit.component !== 'edge'}
                    onClick={() => op(o)}
                  >
                    {o === 'loopcut' ? 'loop cut' : o}
                  </button>
                ))}
                <button className="studio-btn" disabled={meshEdit.selection.length < 2} onClick={() => op('merge')}>
                  merge
                </button>
                <button
                  className="studio-btn"
                  title={
                    meshEdit.component === 'face' && meshEdit.selection.length
                      ? 'Triangulate the selected faces'
                      : 'Triangulate the whole mesh'
                  }
                  onClick={() => op('triangulate')}
                >
                  triangulate
                </button>
                <button
                  className="studio-btn"
                  disabled={meshEdit.component === 'face' || meshEdit.selection.length < 2}
                  title="Connect the selected vertices/edges with new edges (splits the shared face)"
                  onClick={() => op('connect')}
                >
                  connect
                </button>
                <button
                  className="studio-btn"
                  disabled={meshEdit.component !== 'edge' || meshEdit.selection.length < 2}
                  title="Bridge two selected edge loops with a band of faces"
                  onClick={() => op('bridge')}
                >
                  bridge
                </button>
              </div>

              <div className="studio-label" style={{ marginTop: 12 }}>Tools</div>
              <div className="studio-segmented">
                <button
                  className={meshEdit.tool === 'loopcut' ? 'active' : ''}
                  onClick={() => setMeshTool(meshEdit.tool === 'loopcut' ? 'select' : 'loopcut')}
                >
                  loop cut
                </button>
                <button
                  className={meshEdit.tool === 'knife' ? 'active' : ''}
                  onClick={() => setMeshTool(meshEdit.tool === 'knife' ? 'select' : 'knife')}
                >
                  knife
                </button>
              </div>
              {meshEdit.tool === 'loopcut' && (
                <div className="studio-hint">Hover an edge to preview the loop, click to cut, then drag to slide.</div>
              )}
              {meshEdit.tool === 'knife' && (
                <div className="studio-hint">Click along edges to trace a cut; right-click to finish.</div>
              )}

              <div className="studio-label" style={{ marginTop: 12 }}>Sculpt</div>
              <div className="studio-grid">
                {SCULPT_BRUSHES.map((b) => (
                  <button
                    key={b}
                    className={`studio-btn ${sculpt?.mode === b ? 'active' : ''}`}
                    onClick={() => (sculpt?.mode === b ? setMeshSculptBrush(null) : patchBrush({ mode: b }))}
                  >
                    {b}
                  </button>
                ))}
              </div>
              {sculpt && (
                <>
                  <label className="studio-slider">
                    Radius <span>{sculpt.radius.toFixed(1)}</span>
                    <input
                      type="range" min={0.2} max={8} step={0.1} value={sculpt.radius}
                      onChange={(e) => patchBrush({ radius: Number(e.target.value) })}
                    />
                  </label>
                  <label className="studio-slider">
                    Strength <span>{sculpt.strength.toFixed(2)}</span>
                    <input
                      type="range" min={0.05} max={1} step={0.05} value={sculpt.strength}
                      onChange={(e) => patchBrush({ strength: Number(e.target.value) })}
                    />
                  </label>
                  <label className="studio-check">
                    <input type="checkbox" checked={!!sculpt.invert} onChange={(e) => patchBrush({ invert: e.target.checked })} />
                    Invert
                  </label>
                  <div className="studio-hint">Drag on the mesh to sculpt. Pick a component above to return to editing.</div>
                </>
              )}
            </>
          )}
        </div>

        {is3d && selected?.mesh && (
          <div className="studio-section modeling-csg">
            <ModelingPanel entity={selected} disabled={editing} />
          </div>
        )}

        <div className="studio-section">
          <div className="studio-label">
            <Save size={13} /> Library
          </div>
          <button className="studio-btn wide" disabled={!selected?.mesh} onClick={save}>
            Save to Asset Library
          </button>
        </div>

        {status && <div className="studio-status">{status}</div>}
      </div>
    </div>
  );
}
