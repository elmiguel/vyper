import { useEffect, useState } from 'react';
import { Move3D, RotateCw, Scaling, Palette, PackagePlus } from 'lucide-react';
import { useModelerStore } from './modelerStore';
import { useEditorStore } from '@/store/editorStore';
import { NumberInput } from '@/ui/NumberInput';
import { MaterialEditor } from '@/panels/MaterialEditor';
import type { InspectorAxis } from './modelerInspectorActions';

const AXES: InspectorAxis[] = ['x', 'y', 'z'];
const AXIS_INDEX: Record<InspectorAxis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };
const trim3 = (v: number) => String(Number(v.toFixed(3)));

/** Human label for what the numeric transform currently acts on (it follows component mode). */
function targetLabel(component: string, count: number): string {
  if (component === 'object') return 'Whole object';
  const noun = component === 'vertex' ? 'vertex' : component === 'edge' ? 'edge' : 'face';
  return `${count} ${noun}${count === 1 ? '' : component === 'vertex' ? 'es' : 's'}`;
}

/**
 * The Modeling Studio's Inspector: numeric editing of the current selection's transform
 * (absolute position + size, and relative rotation), plus the backing mesh's colour and PBR
 * material. Transform edits follow the active component mode — the whole object in Object mode,
 * or the picked verts/edges/faces in component modes — via the store's numeric-transform
 * actions (each one undoable). Material edits persist to the project's mesh entity, so they
 * travel with the model into the game.
 */
export function ModelerInspector() {
  // Re-read derived bounds whenever geometry / selection / focus changes.
  useModelerStore((s) => s.revision);
  useModelerStore((s) => s.selRevision);
  useModelerStore((s) => s.activeRevision);
  const selection = useModelerStore((s) => s.selection);
  const component = useModelerStore((s) => s.component);
  const bounds = useModelerStore((s) => s.selectionBounds)();
  const setSelectionCenter = useModelerStore((s) => s.setSelectionCenter);
  const setSelectionDimension = useModelerStore((s) => s.setSelectionDimension);
  const nudgeSelectionRotation = useModelerStore((s) => s.nudgeSelectionRotation);

  // The project entity the modeler mirrors its geometry into — it also carries colour + material.
  const entity = useEditorStore((s) => s.entities.find((e) => e.mesh));
  const updateMesh = useEditorStore((s) => s.updateMesh);

  // "Make asset": export the focused object (Object mode) to the asset library; the toggle
  // reflects whether a linked asset exists for it.
  const makeAsset = useModelerStore((s) => s.makeSelectedObjectAsset);
  const removeAsset = useModelerStore((s) => s.removeSelectedObjectAsset);
  const assetId = useModelerStore((s) => s.selectedObjectAssetId)();
  const setReference = useModelerStore((s) => s.setSelectedObjectReference);
  // Derive the reference flag from a *subscribed* asset list so the checkbox re-renders when the
  // flag flips (the asset lives in editorStore.assetLibrary, which this panel otherwise doesn't
  // watch — without this the controlled checkbox snaps back to its stale value).
  const assets = useEditorStore((s) => s.assetLibrary.assets);
  const isReference = !!assets.find((a) => a.id === assetId)?.reference;
  const objectSelected = component === 'object' && selection.length > 0;

  // Rotation is dialed as an absolute angle per axis *for the current selection*: we apply the
  // delta to the mesh and reset the dial whenever the selection (or mode) changes, since the
  // baked geometry has no persistent rotation of its own.
  const [rot, setRot] = useState({ x: 0, y: 0, z: 0 });
  useEffect(() => setRot({ x: 0, y: 0, z: 0 }), [selection, component]);

  const onRotate = (axis: InspectorAxis, next: number) => {
    const delta = next - rot[axis];
    if (delta !== 0) nudgeSelectionRotation({ x: 0, y: 0, z: 0, [axis]: delta });
    setRot((r) => ({ ...r, [axis]: next }));
  };

  const hasSelection = bounds.count > 0;

  return (
    <div className="panel inspector modeler-inspector">
      <div className="panel-head">Inspector</div>
      <div className="panel-scroll">
        <div className="studio-section">
          <div className="studio-label"><Move3D size={13} /> Transform</div>
          {hasSelection ? (
            <>
              <div className="vec-row">
                <span className="field-label">Position</span>
                {AXES.map((a) => (
                  <NumberInput key={a} step={0.1} value={bounds.center[AXIS_INDEX[a]]} display={trim3}
                    onChange={(n) => setSelectionCenter(a, n)} />
                ))}
              </div>
              <div className="vec-row">
                <span className="field-label"><RotateCw size={11} /> Rotate°</span>
                {AXES.map((a) => (
                  <NumberInput key={a} step={5} value={rot[a]} display={trim3}
                    onChange={(n) => onRotate(a, n)} />
                ))}
              </div>
              <div className="vec-row">
                <span className="field-label"><Scaling size={11} /> Size</span>
                {AXES.map((a) => (
                  <NumberInput key={a} step={0.1} value={bounds.size[AXIS_INDEX[a]]} display={trim3}
                    onChange={(n) => setSelectionDimension(a, n)} />
                ))}
              </div>
              <div className="empty-hint inline">Editing: {targetLabel(component, bounds.count)}</div>
            </>
          ) : (
            <div className="empty-hint">Select an object (or verts/edges/faces) to edit its position, rotation, and size.</div>
          )}
        </div>

        <div className="studio-section">
          <div className="studio-label"><Palette size={13} /> Material</div>
          {entity ? (
            <>
              <div className="field">
                <span className="field-label">Color</span>
                <input
                  type="color"
                  value={entity.mesh?.color ?? '#ffffff'}
                  onChange={(e) => updateMesh(entity.id, { color: e.target.value })}
                />
              </div>
              <MaterialEditor entity={entity} />
            </>
          ) : (
            <div className="empty-hint">No mesh to shade yet.</div>
          )}
        </div>

        <div className="studio-section">
          <div className="studio-label"><PackagePlus size={13} /> Asset</div>
          {objectSelected ? (
            <>
              <label className="field check">
                <input
                  type="checkbox"
                  checked={!!assetId}
                  onChange={(e) => (e.target.checked ? makeAsset() : removeAsset())}
                />
                Make asset (save to library)
              </label>
              <div className="empty-hint inline">
                {assetId
                  ? 'Saved to the asset library with its material + textures — reusable in the game studio.'
                  : 'Saves just this object (geometry + material + textures) to the asset library.'}
              </div>
              {assetId && (
                <>
                  <label className="field check">
                    <input type="checkbox" checked={isReference} onChange={(e) => setReference(e.target.checked)} />
                    Make reference (linked proxy)
                  </label>
                  <div className="empty-hint inline">
                    {isReference
                      ? 'Instances in the game stay linked — re-saving this object updates them on load.'
                      : 'Instances are independent copies; turn on to keep them linked to this source.'}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="empty-hint">Select an object (Object mode) to save it as an asset.</div>
          )}
        </div>
      </div>
    </div>
  );
}
