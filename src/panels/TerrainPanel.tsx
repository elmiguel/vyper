import { useEffect } from 'react';
import { Mountain, Brush } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import { defaultTerrain, type BrushMode, type Entity } from '@/types';

const MODES: BrushMode[] = ['raise', 'lower', 'smooth', 'flatten'];

function Slider({ label, value, min, max, step, onChange, disabled }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="field-val">{Number.isInteger(step) ? value : value.toFixed(2)}</span>
    </div>
  );
}

/**
 * Terrain authoring: grid/size/height controls plus the sculpt brush. Rendered in
 * the Inspector for `kind: 'terrain'` entities. Sculpting is left-drag on the
 * terrain in the viewport; the brush settings live in the store so the sculpt
 * controller (SceneManager) reads them live.
 */
export function TerrainPanel({ entity, disabled }: { entity: Entity; disabled?: boolean }) {
  const updateTerrain = useEditorStore((s) => s.updateTerrain);
  const sculpting = useEditorStore((s) => s.sculpting);
  const setSculpting = useEditorStore((s) => s.setSculpting);
  const brush = useEditorStore((s) => s.brush);
  const setBrush = useEditorStore((s) => s.setBrush);

  // Leave sculpt mode if this terrain is deselected/unmounted.
  useEffect(() => () => setSculpting(false), [setSculpting]);

  const t = entity.mesh?.terrain ?? defaultTerrain();

  return (
    <section>
      <h4><Mountain size={13} /> Terrain</h4>
      <Slider label="Size" value={t.size} min={8} max={200} step={1} disabled={disabled}
        onChange={(v) => updateTerrain(entity.id, { size: v, heights: [] })} />
      <Slider label="Detail" value={t.subdivisions} min={8} max={256} step={1} disabled={disabled}
        onChange={(v) => updateTerrain(entity.id, { subdivisions: Math.round(v), heights: [] })} />
      <Slider label="Max height" value={t.maxHeight} min={0} max={50} step={0.5} disabled={disabled}
        onChange={(v) => updateTerrain(entity.id, { maxHeight: v })} />

      <button
        className={`add-script-btn ${sculpting ? 'on' : ''}`}
        disabled={disabled}
        onClick={() => setSculpting(!sculpting)}
      >
        <Brush size={13} /> {sculpting ? 'Stop sculpting' : 'Sculpt'}
      </button>

      {sculpting && (
        <>
          <div className="fx-add-grid">
            {MODES.map((m) => (
              <button key={m} className={`fx-add-item ${brush.mode === m ? 'on' : ''}`} onClick={() => setBrush({ mode: m })}>
                {m}
              </button>
            ))}
          </div>
          <Slider label="Brush size" value={brush.radius} min={0.5} max={20} step={0.5} onChange={(v) => setBrush({ radius: v })} />
          <Slider label="Strength" value={brush.strength} min={0.01} max={0.5} step={0.01} onChange={(v) => setBrush({ strength: v })} />
          <div className="empty-hint inline">Left-drag on the terrain to sculpt. Middle-drag still pans.</div>
        </>
      )}

      <button className="add-script-btn" disabled={disabled} onClick={() => updateTerrain(entity.id, { heights: [] })}>
        Reset (flatten)
      </button>
    </section>
  );
}
