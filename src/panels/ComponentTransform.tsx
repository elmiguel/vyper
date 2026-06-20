import { useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { getManager } from '@/babylon/engine';
import { NumberInput } from '@/ui/NumberInput';

const trim3 = (v: number) => String(Number(v.toFixed(3)));
const AXES = ['x', 'y', 'z'] as const;

/**
 * Numeric transform for the active mesh-edit selection, shown in the Inspector while in Edit
 * Mode. Reads the live selection bounds from the scene's MeshEditController and writes absolute
 * Position (centroid) / Dimensions (size) and incremental Rotation back through it — each edit
 * lands as one undoable step, mirroring a gizmo drag. Replaces the retired Studio Inspector's
 * transform fields. Re-renders whenever `meshEdit.selection` changes (every commit bumps it).
 */
export function ComponentTransform() {
  const active = useEditorStore((s) => s.meshEdit.active);
  const selection = useEditorStore((s) => s.meshEdit.selection);
  const [rot, setRot] = useState({ x: 0, y: 0, z: 0 });

  const mec = getManager()?.meshEditController;
  if (!active || !mec || selection.length === 0) return null;
  const b = mec.selectionBounds();
  if (b.count === 0) return null;

  const applyRotation = () => {
    if (rot.x === 0 && rot.y === 0 && rot.z === 0) return;
    mec.nudgeSelectionRotation(rot.x, rot.y, rot.z);
    setRot({ x: 0, y: 0, z: 0 });
  };

  return (
    <section>
      <h4>Selection Transform</h4>
      <div className="vec-row">
        <span className="field-label">Position</span>
        {AXES.map((a, i) => (
          <NumberInput
            key={a}
            step={0.1}
            value={b.center[i]}
            display={trim3}
            onChange={(n) => mec.setSelectionCenter(i as 0 | 1 | 2, n)}
          />
        ))}
      </div>
      <div className="vec-row">
        <span className="field-label">Dimensions</span>
        {AXES.map((a, i) => (
          <NumberInput
            key={a}
            step={0.1}
            value={b.size[i]}
            display={trim3}
            onChange={(n) => mec.setSelectionDimension(i as 0 | 1 | 2, n)}
          />
        ))}
      </div>
      <div className="vec-row">
        <span className="field-label" title="Rotate the selection about its centroid by these degrees">Rotate °</span>
        {AXES.map((a) => (
          <NumberInput
            key={a}
            step={5}
            value={rot[a]}
            onChange={(n) => setRot((r) => ({ ...r, [a]: n }))}
          />
        ))}
        <button className="studio-btn" disabled={rot.x === 0 && rot.y === 0 && rot.z === 0} onClick={applyRotation}>
          apply
        </button>
      </div>
    </section>
  );
}
