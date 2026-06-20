import { useState } from 'react';
import { Box, Pencil, Save, Scissors, Frame, Undo2, Redo2, Globe } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import { getManager } from '@/babylon/engine';
import { toCustomGeometry } from '@/babylon/customMesh';
import { buildPrimitive, type KernelPrimitive } from '@/kernel/primitives';
import { toGeometry } from '@/kernel/render';
import { ModelingPanel } from '@/panels/ModelingPanel';
import { EnvironmentIBL } from '@/panels/EnvironmentIBL';
import type { MeshEditController } from '@/babylon/MeshEditController';
import { defaultSculptBrush, type CustomGeometry, type SculptBrushMode } from '@/types';
import type { MeshComponentMode, MeshEditTool } from '@/store/editorTypes';

// Full primitive set, matching the studio — built by the kernel (clean quad topology).
const PRIMITIVES: Array<{ kind: KernelPrimitive; label: string }> = [
  { kind: 'cube', label: 'Cube' },
  { kind: 'plane', label: 'Plane' },
  { kind: 'grid', label: 'Grid' },
  { kind: 'cylinder', label: 'Cylinder' },
  { kind: 'sphere', label: 'Sphere' },
  { kind: 'cone', label: 'Cone' },
  { kind: 'torus', label: 'Torus' },
];

const COMPONENTS: MeshComponentMode[] = ['vertex', 'edge', 'face'];

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
  const saveModelerObjectAsset = useEditorStore((s) => s.saveModelerObjectAsset);
  const updateAsset = useEditorStore((s) => s.updateAsset);
  const updateMesh = useEditorStore((s) => s.updateMesh);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const focusSelected = useEditorStore((s) => s.focusSelected);

  const [status, setStatus] = useState<string>('');
  const [asReference, setAsReference] = useState(false);
  const [retopoRes, setRetopoRes] = useState(4);

  const selected = entities.find((e) => e.id === selectedId);
  const is3d = mode === '3d';
  // Edit Mode targets buildable geometry (primitives + baked custom meshes), not
  // terrain/loaded models/lights.
  const editableKinds = new Set(['box', 'sphere', 'ground', 'plane', 'cylinder', 'cone', 'custom']);
  const canEdit = is3d && !!selected?.mesh && editableKinds.has(selected.mesh.kind);
  const editing = meshEdit.active && meshEdit.entityId === selectedId;
  const hasSel = meshEdit.selection.length > 0;

  const spawn = (kind: KernelPrimitive, label: string) => {
    const geo = toGeometry(buildPrimitive(kind, 2));
    addCustomMesh(geo, label);
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

  /** Export the selected mesh to the asset library. As a reference, the asset is flagged linked
   *  and this entity becomes an instance (placed copies re-sync from it), mirroring the studio's
   *  "Make asset" + reference toggle. */
  const makeAsset = () => {
    const geo = geometryOf();
    if (!geo || !selected) {
      setStatus('Nothing to save — select a mesh.');
      return;
    }
    const id = saveModelerObjectAsset(selected.name || 'Object', geo, selected.mesh?.material, selected.mesh?.color ?? '#ffffff');
    if (asReference) {
      updateAsset(id, { reference: true });
      updateMesh(selected.id, { linkedAssetId: id }); // this entity is now a linked instance
    }
    setStatus(`Made asset “${selected.name || 'Object'}”${asReference ? ' (reference)' : ''}.`);
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
              <button key={p.kind} className="studio-btn" disabled={!is3d} onClick={() => spawn(p.kind, p.label)}>
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
                <button className="studio-btn" disabled={!hasSel} onClick={() => sel((c) => c.selectLoop())}>loop</button>
                <button className="studio-btn" disabled={meshEdit.component !== 'edge' || !hasSel} onClick={() => sel((c) => c.selectRing())}>ring</button>
                <button className="studio-btn" onClick={() => sel((c) => c.frameSelection())}>frame</button>
              </div>
              {/* Convert the selection to another component type. */}
              <div className="studio-grid">
                {COMPONENTS.filter((c) => c !== meshEdit.component).map((c) => (
                  <button key={c} className="studio-btn" disabled={!hasSel} onClick={() => sel((k) => k.convertSelection(c))}>
                    → {c}
                  </button>
                ))}
              </div>
              {/* Modeling operators for the active component mode. */}
              <div className="studio-grid">
                {meshEdit.component === 'face' && (
                  <>
                    <button className="studio-btn" disabled={!hasSel} onClick={() => op('extrude')}>extrude</button>
                    <button className="studio-btn" disabled={!hasSel} onClick={() => op('inset')}>inset</button>
                    <button className="studio-btn" onClick={() => op('subdivide')}>subdivide</button>
                    <button className="studio-btn" disabled={!hasSel} onClick={() => sel((c) => c.poke())}>poke</button>
                    <button className="studio-btn" disabled={!hasSel} onClick={() => sel((c) => c.reverseNormals())}>reverse</button>
                    <button className="studio-btn" disabled={!hasSel} onClick={() => sel((c) => c.extract())}>extract</button>
                    <button className="studio-btn" title="Group the selected islands so they select/move as one" disabled={!hasSel} onClick={() => sel((c) => c.group())}>group</button>
                    <button className="studio-btn" title="Ungroup the selected island" disabled={!hasSel} onClick={() => sel((c) => c.ungroup())}>ungroup</button>
                  </>
                )}
                {meshEdit.component === 'vertex' && (
                  <>
                    <button className="studio-btn" disabled={meshEdit.selection.length < 2} onClick={() => op('connect')}>connect</button>
                    <button className="studio-btn" disabled={meshEdit.selection.length < 2} onClick={() => op('merge')}>merge</button>
                    <button className="studio-btn" disabled={meshEdit.selection.length < 3} onClick={() => sel((c) => c.addFace())}>add face</button>
                    <button className="studio-btn" disabled={!hasSel} onClick={() => sel((c) => c.averageVertices())}>average</button>
                  </>
                )}
                {meshEdit.component === 'edge' && (
                  <>
                    <button className="studio-btn" disabled={!hasSel} onClick={() => op('bevel')}>bevel</button>
                    <button className="studio-btn" disabled={meshEdit.selection.length < 2} onClick={() => op('bridge')}>bridge</button>
                    <button className="studio-btn" disabled={!hasSel} onClick={() => sel((c) => c.collapseEdges())}>collapse</button>
                    <button className="studio-btn" disabled={!hasSel} onClick={() => sel((c) => c.addVertexOnEdges())}>add vertex</button>
                  </>
                )}
                <button
                  className="studio-btn"
                  title={meshEdit.component === 'face' && hasSel ? 'Triangulate the selected faces' : 'Triangulate the whole mesh'}
                  onClick={() => op('triangulate')}
                >
                  triangulate
                </button>
                <button
                  className="studio-btn"
                  title={meshEdit.component === 'face' && hasSel ? 'Quadrangulate the selected faces' : 'Merge coplanar triangles into quads (whole mesh)'}
                  onClick={() => sel((c) => c.quadrangulate())}
                >
                  quadrangulate
                </button>
                <button className="studio-btn" disabled={!hasSel} onClick={() => op('delete')}>delete</button>
                <button className="studio-btn" disabled={!hasSel} onClick={() => sel((c) => c.clearSelection())}>clear</button>
              </div>

              <div className="studio-label" style={{ marginTop: 12 }}>Clipboard</div>
              <div className="studio-segmented">
                <button
                  className="studio-btn"
                  disabled={meshEdit.component !== 'face' || !hasSel}
                  title="Duplicate the selected faces in place"
                  onClick={() => sel((c) => c.duplicateComponents())}
                >
                  duplicate
                </button>
                <button
                  className="studio-btn"
                  disabled={meshEdit.component !== 'face' || !hasSel}
                  title="Copy the selected faces to the clipboard"
                  onClick={() => sel((c) => c.copyComponents())}
                >
                  copy
                </button>
                <button className="studio-btn" title="Paste clipboard faces" onClick={() => sel((c) => c.pasteComponents())}>paste</button>
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
                <button
                  className={meshEdit.tool === 'drawpoly' ? 'active' : ''}
                  onClick={() => setMeshTool(meshEdit.tool === 'drawpoly' ? 'select' : 'drawpoly')}
                >
                  draw poly
                </button>
                <button
                  className={meshEdit.tool === 'sketchtopo' ? 'active' : ''}
                  onClick={() => setMeshTool(meshEdit.tool === 'sketchtopo' ? 'select' : 'sketchtopo')}
                >
                  sketch retopo
                </button>
              </div>
              {meshEdit.tool === 'loopcut' && (
                <div className="studio-hint">Hover an edge to preview the loop, click to cut, then drag to slide.</div>
              )}
              {meshEdit.tool === 'knife' && (
                <div className="studio-hint">Click along edges to trace a cut; right-click to finish.</div>
              )}
              {meshEdit.tool === 'drawpoly' && (
                <div className="studio-hint">Click on the ground to drop points; right-click or Enter closes the face.</div>
              )}
              {meshEdit.tool === 'sketchtopo' && (
                <>
                  <div className="studio-hint studio-warn">⚠ Work in progress — retopo is unreliable: it only fills quads when four strokes cleanly enclose a region, with no snapping or auto-close yet. A proper rebuild is planned.</div>
                  <div className="studio-hint">Drag strokes over the surface; four strokes that enclose a region fill with quads. Enter commits the cage.</div>
                  <div className="studio-slider">
                    grid {retopoRes}×{retopoRes}
                    <button className="studio-btn" title="Fewer subdivisions" onClick={() => { const r = Math.max(1, retopoRes - 1); setRetopoRes(r); sel((c) => c.setRetopoResolution(r)); }}>−</button>
                    <button className="studio-btn" title="More subdivisions" onClick={() => { const r = Math.min(16, retopoRes + 1); setRetopoRes(r); sel((c) => c.setRetopoResolution(r)); }}>+</button>
                  </div>
                </>
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
          <div className="studio-label">View &amp; history</div>
          <div className="studio-grid">
            <button className="studio-btn" onClick={() => focusSelected()}><Frame size={12} /> frame</button>
            <button className="studio-btn" onClick={() => undo()}><Undo2 size={12} /> undo</button>
            <button className="studio-btn" onClick={() => redo()}><Redo2 size={12} /> redo</button>
          </div>
        </div>

        {is3d && (
          <div className="studio-section">
            <div className="studio-label"><Globe size={13} /> Lookdev</div>
            {/* Environment/IBL for the viewport — the same render-settings source the Inspector
                uses, surfaced here so lookdev works while editing a mesh. Tone/exposure live in
                the Render Settings (Inspector with nothing selected). */}
            <EnvironmentIBL />
          </div>
        )}

        <div className="studio-section">
          <div className="studio-label">
            <Save size={13} /> Library
          </div>
          <button className="studio-btn wide" disabled={!selected?.mesh} onClick={makeAsset}>
            Make Asset
          </button>
          <label className="studio-check" title="Placed copies of this asset stay linked and re-sync when you edit the source">
            <input type="checkbox" checked={asReference} onChange={(e) => setAsReference(e.target.checked)} />
            Reference (instances stay linked)
          </label>
        </div>

        {status && <div className="studio-status">{status}</div>}
      </div>
    </div>
  );
}
