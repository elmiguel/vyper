import { NumberInput } from '@/ui/NumberInput';
import { useEditorStore } from '@/store/editorStore';
import { defaultImportTransform, type Asset, type Vec3 } from '@/types';

function Vec3Row({ label, value, onChange, step = 0.1 }: { label: string; value: Vec3; onChange: (v: Vec3) => void; step?: number }) {
  return (
    <div className="ae-vec">
      <span className="ae-label">{label}</span>
      {(['x', 'y', 'z'] as const).map((a) => (
        <NumberInput key={a} step={step} value={value[a]} display={(n) => String(Math.round(n * 1000) / 1000)} onChange={(n) => onChange({ ...value, [a]: n })} />
      ))}
    </div>
  );
}

/**
 * Edit panel for an asset: metadata (name / tags / notes), the import transform
 * (scale / rotation / recenter / normalize — live-applied to the preview), and a
 * material tint. All edits flow through assetSlice.updateAsset (undoable) and, for
 * models, re-render the live ModelPreview.
 */
export function AssetEditor({ asset }: { asset: Asset }) {
  const updateAsset = useEditorStore((s) => s.updateAsset);
  const isModel = asset.type === 'model';
  const t = asset.importTransform ?? defaultImportTransform();
  const setT = (patch: Partial<typeof t>) => updateAsset(asset.id, { importTransform: { ...t, ...patch } });

  return (
    <div className="asset-editor">
      <section className="ae-section">
        <h4>Metadata</h4>
        <label className="ae-field">
          <span className="ae-label">Name</span>
          <input className="ae-input" value={asset.name} onChange={(e) => updateAsset(asset.id, { name: e.target.value })} />
        </label>
        <label className="ae-field">
          <span className="ae-label">Tags</span>
          <input
            className="ae-input"
            placeholder="comma, separated"
            value={(asset.tags ?? []).join(', ')}
            onChange={(e) => updateAsset(asset.id, { tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          />
        </label>
        <label className="ae-field ae-field-col">
          <span className="ae-label">Notes</span>
          <textarea className="ae-input ae-notes" rows={3} value={asset.notes ?? ''} onChange={(e) => updateAsset(asset.id, { notes: e.target.value })} />
        </label>
      </section>

      {isModel && (
        <section className="ae-section">
          <h4>Import transform</h4>
          <Vec3Row label="Scale" value={t.scale} onChange={(scale) => setT({ scale })} />
          <Vec3Row label="Rotation°" value={t.rotationDeg} step={5} onChange={(rotationDeg) => setT({ rotationDeg })} />
          <label className="ae-check">
            <input type="checkbox" checked={t.recenter} onChange={(e) => setT({ recenter: e.target.checked })} /> Recenter pivot
          </label>
          <label className="ae-check">
            <input type="checkbox" checked={t.normalizeSize} onChange={(e) => setT({ normalizeSize: e.target.checked })} /> Normalize size (largest side → 1 unit)
          </label>
        </section>
      )}

      {isModel && (
        <section className="ae-section">
          <h4>Material</h4>
          <div className="ae-field">
            <span className="ae-label">Tint</span>
            <input type="color" className="ae-color" value={asset.material?.colorHex ?? '#ffffff'} onChange={(e) => updateAsset(asset.id, { material: { ...asset.material, colorHex: e.target.value } })} />
            {asset.material?.colorHex && (
              <button className="ae-clear" onClick={() => updateAsset(asset.id, { material: { ...asset.material, colorHex: undefined } })}>
                Clear
              </button>
            )}
          </div>
        </section>
      )}

      {isModel && (
        <section className="ae-section">
          <h4>Geometry</h4>
          <label className="ae-check">
            <input
              type="checkbox"
              checked={!!asset.material?.doubleSided}
              onChange={(e) => updateAsset(asset.id, { material: { ...asset.material, doubleSided: e.target.checked } })}
            /> Double-sided (render back faces — fixes inside-out / thin meshes)
          </label>
          <p className="ae-hint">
            Mesh editing (vertices, topology, remeshing) is done in a 3D modeler.
            Round-trip: edit the model in Blender, export to <code>.glb</code>/<code>.obj</code>,
            then re-upload it here.
          </p>
        </section>
      )}
    </div>
  );
}
