import { useMemo, useState } from 'react';
import { Combine, Loader2 } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import { getManager } from '@/babylon/engine';
import type { BooleanOp, Entity } from '@/types';

const OPS: { op: BooleanOp; label: string }[] = [
  { op: 'union', label: 'Union' },
  { op: 'subtract', label: 'Subtract' },
  { op: 'intersect', label: 'Intersect' },
];

/**
 * Constructive solid geometry (CSG2). Combine the selected mesh with another mesh
 * via union/subtract/intersect to bake a new custom mesh. Shown in the Inspector
 * for non-model meshes in 3D. The boolean runs in Babylon (Manifold WASM); the
 * result is added as a `kind: 'custom'` entity.
 */
export function ModelingPanel({ entity, disabled }: { entity: Entity; disabled?: boolean }) {
  const mode = useEditorStore((s) => s.mode);
  const entities = useEditorStore((s) => s.entities);
  const addCustomMesh = useEditorStore((s) => s.addCustomMesh);

  const candidates = useMemo(
    () => entities.filter((e) => e.id !== entity.id && e.mesh && e.mesh.kind !== 'model'),
    [entities, entity.id],
  );
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (mode === '2d') return null;

  const target = targetId || candidates[0]?.id || '';

  const run = async (op: BooleanOp) => {
    const manager = getManager();
    if (!manager || !target) return;
    setBusy(true);
    setError('');
    try {
      const geo = await manager.applyBoolean(entity.id, target, op);
      if (!geo) throw new Error('Both meshes need solid geometry.');
      addCustomMesh(geo, `${op} of ${entity.name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h4><Combine size={13} /> Modeling (CSG)</h4>
      {candidates.length === 0 ? (
        <div className="empty-hint inline">Add another mesh to combine with this one.</div>
      ) : (
        <>
          <div className="field">
            <span className="field-label">With</span>
            <select value={target} disabled={disabled || busy} onChange={(e) => setTargetId(e.target.value)}>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="fx-add-grid">
            {OPS.map(({ op, label }) => (
              <button key={op} className="fx-add-item" disabled={disabled || busy} onClick={() => void run(op)}>
                {busy ? <Loader2 size={12} className="spin" /> : label}
              </button>
            ))}
          </div>
          {error && <div className="asset-upload-err">{error}</div>}
          <div className="empty-hint inline">Bakes a new mesh; the originals are kept (delete them if you like).</div>
        </>
      )}
    </section>
  );
}
