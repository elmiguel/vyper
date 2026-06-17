import { useMemo } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { ASSET_ROOT } from '@/store/slices/assetSlice';
import { defaultVolume, type BoundaryMode, type Entity, type VolumeConfig, type VolumePreset } from '@/types';

const BOUNDARIES: { value: BoundaryMode; label: string }[] = [
  { value: 'none', label: 'No boundary' },
  { value: 'keepIn', label: "Keep inside (can't leave)" },
  { value: 'keepOut', label: "Keep outside (can't enter)" },
  { value: 'oneWayOut', label: 'One-way out (leave, no re-entry)' },
  { value: 'trap', label: "Trap (enter, can't leave)" },
];

const PRESETS: { value: VolumePreset; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'deadZone', label: 'Dead Zone' },
  { value: 'fog', label: 'Fog' },
  { value: 'water', label: 'Water' },
  { value: 'sound', label: 'Sound' },
];

function Slider({ label, value, min, max, step, onChange, disabled }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="field-val">{value.toFixed(step < 0.1 ? 2 : 1)}</span>
    </div>
  );
}

/**
 * Volume behaviour editor for a trigger-enabled entity: a movement boundary mode
 * and an optional preset (Dead Zone / Fog / Water / Sound). Writes to
 * `trigger.volume` via `updateVolume`; the runtime's VolumeEnforcer applies it.
 */
export function VolumePanel({ entity, disabled }: { entity: Entity; disabled?: boolean }) {
  const updateVolume = useEditorStore((s) => s.updateVolume);
  const assets = useEditorStore((s) => s.assetLibrary.assets);
  const v = entity.trigger?.volume ?? defaultVolume();
  const set = (patch: Partial<VolumeConfig>) => updateVolume(entity.id, patch);

  const audioClips = useMemo(
    () =>
      assets
        .filter((a) => a.type === 'audio' && a.textures[0])
        .map((a) => ({ url: `${a.rootUrl ?? ASSET_ROOT}${a.textures[0]}`, name: a.name })),
    [assets],
  );

  return (
    <>
      <div className="field">
        <span className="field-label">Boundary</span>
        <select value={v.boundary} disabled={disabled} onChange={(e) => set({ boundary: e.target.value as BoundaryMode })}>
          {BOUNDARIES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
      </div>

      <div className="field">
        <span className="field-label">Preset</span>
        <select value={v.preset} disabled={disabled} onChange={(e) => set({ preset: e.target.value as VolumePreset })}>
          {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      {v.preset === 'deadZone' && (
        <label className="field check">
          <input type="checkbox" checked={v.respawn} disabled={disabled} onChange={(e) => set({ respawn: e.target.checked })} />
          Respawn at start (off = destroy)
        </label>
      )}

      {(v.preset === 'fog' || v.preset === 'water') && (
        <>
          <div className="field">
            <span className="field-label">{v.preset === 'water' ? 'Water tint' : 'Fog color'}</span>
            <input type="color" value={v.color} disabled={disabled} onChange={(e) => set({ color: e.target.value })} />
          </div>
          <Slider label="Density" value={v.density} min={0} max={0.5} step={0.005} disabled={disabled} onChange={(n) => set({ density: n })} />
        </>
      )}

      {v.preset === 'water' && (
        <>
          <Slider label="Drag" value={v.drag} min={0} max={0.6} step={0.01} disabled={disabled} onChange={(n) => set({ drag: n })} />
          <Slider label="Buoyancy" value={v.buoyancy} min={0} max={20} step={0.5} disabled={disabled} onChange={(n) => set({ buoyancy: n })} />
        </>
      )}

      {v.preset === 'sound' && (
        <>
          {audioClips.length > 0 && (
            <div className="field">
              <span className="field-label">Clip</span>
              <select value={v.soundUrl} disabled={disabled} onChange={(e) => set({ soundUrl: e.target.value })}>
                <option value="">Choose uploaded audio…</option>
                {audioClips.map((c) => <option key={c.url} value={c.url}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <span className="field-label">Sound URL</span>
            <input placeholder="/uploads/ambience.mp3 or https://…" disabled={disabled} value={v.soundUrl} onChange={(e) => set({ soundUrl: e.target.value })} />
          </div>
          <Slider label="Volume" value={v.soundVolume} min={0} max={1} step={0.05} disabled={disabled} onChange={(n) => set({ soundVolume: n })} />
          <label className="field check">
            <input type="checkbox" checked={v.soundLoop} disabled={disabled} onChange={(e) => set({ soundLoop: e.target.checked })} />
            Loop
          </label>
        </>
      )}

      {(v.boundary !== 'none' || v.preset !== 'none') && (
        <div className="empty-hint inline">Boundary &amp; presets are enforced during Play. Fog/Water tint &amp; Sound apply while the camera is inside.</div>
      )}
    </>
  );
}
