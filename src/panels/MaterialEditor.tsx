import { useMemo } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { assetsWithTextures } from '@/assets/deriveTextures';
import { ASSET_ROOT } from '@/store/slices/assetSlice';
import { defaultMaterial, type Entity, type MaterialConfig } from '@/types';

/** A texture option for a map slot: its served URL + a display name. */
interface TexOption {
  url: string;
  name: string;
}

function Slider({ label, value, min, max, step, onChange, disabled }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="field-val">{value.toFixed(2)}</span>
    </div>
  );
}

/** Sentinel option value: pick it to open the asset library instead of selecting a texture. */
const BROWSE = '__browse__';

/** A dropdown that selects a texture URL (or none) for one PBR map slot. The last entry opens
 *  the asset browser so you can import/pick textures right where you need them. */
function MapSlot({ label, value, options, onChange, onBrowse, disabled }: {
  label: string; value: string | undefined; options: TexOption[]; onChange: (url: string | undefined) => void; onBrowse: () => void; disabled?: boolean;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <select
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => (e.target.value === BROWSE ? onBrowse() : onChange(e.target.value || undefined))}
      >
        <option value="">None</option>
        {options.map((o) => (
          <option key={o.url} value={o.url}>{o.name}</option>
        ))}
        <option value={BROWSE}>{options.length ? 'Import more…' : 'Import textures…'}</option>
      </select>
    </div>
  );
}

/**
 * PBR/standard surface editor for the selected primitive's mesh. Renders inside
 * the Inspector's Mesh section. Writes to `mesh.material` via `updateMaterial`.
 * In 2D mode or for trigger volumes the material is ignored, so a hint is shown.
 */
export function MaterialEditor({ entity, disabled }: { entity: Entity; disabled?: boolean }) {
  const mode = useEditorStore((s) => s.mode);
  const assets = useEditorStore((s) => s.assetLibrary.assets);
  const updateMaterial = useEditorStore((s) => s.updateMaterial);
  const presets = useEditorStore((s) => s.materialPresets);
  const applyPreset = useEditorStore((s) => s.applyMaterialPreset);
  const savePreset = useEditorStore((s) => s.saveMaterialPreset);
  const openAssets = useEditorStore((s) => s.setShowAssetBrowser);

  const texOptions = useMemo<TexOption[]>(
    () =>
      assetsWithTextures(assets)
        .filter((a) => a.type === 'texture' && a.textures[0])
        .map((a) => ({ url: `${a.rootUrl ?? ASSET_ROOT}${a.textures[0]}`, name: a.name })),
    [assets],
  );
  const presetList = useMemo(() => Object.values(presets), [presets]);

  if (mode === '2d' || entity.trigger?.enabled) {
    return <div className="empty-hint inline">Surface materials apply to lit 3D meshes (not 2D or trigger volumes).</div>;
  }

  const m = materialOf(entity);
  const set = (patch: Partial<MaterialConfig>) => updateMaterial(entity.id, patch);
  const onSave = () => {
    const name = window.prompt('Save material as', `${entity.name} material`)?.trim();
    if (name) savePreset(name, materialOf(entity));
  };

  return (
    <>
      <div className="field">
        <span className="field-label">Material</span>
        <select
          value=""
          disabled={disabled}
          onChange={(e) => { if (e.target.value) applyPreset(entity.id, e.target.value); }}
        >
          <option value="">{presetList.length ? 'Apply a material…' : 'No saved materials'}</option>
          {presetList.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button className="field-btn" disabled={disabled} title="Save this mesh's material as a reusable preset" onClick={onSave}>Save</button>
      </div>

      <div className="field">
        <span className="field-label">Surface</span>
        <select value={m.shading} disabled={disabled} onChange={(e) => set({ shading: e.target.value as MaterialConfig['shading'] })}>
          <option value="pbr">PBR (realistic)</option>
          <option value="standard">Standard (flat lit)</option>
        </select>
      </div>

      {m.shading === 'pbr' && (
        <>
          <Slider label="Metallic" value={m.metallic} min={0} max={1} step={0.01} disabled={disabled} onChange={(v) => set({ metallic: v })} />
          <Slider label="Roughness" value={m.roughness} min={0} max={1} step={0.01} disabled={disabled} onChange={(v) => set({ roughness: v })} />
          <Slider label="Opacity" value={m.alpha ?? 1} min={0} max={1} step={0.01} disabled={disabled} onChange={(v) => set({ alpha: v })} />

          <label className="field check">
            <input
              type="checkbox"
              checked={!!m.emissive}
              disabled={disabled}
              onChange={(e) => set({ emissive: e.target.checked ? '#ffffff' : undefined })}
            />
            Emissive (glow)
          </label>
          {m.emissive && (
            <>
              <div className="field">
                <span className="field-label">Glow color</span>
                <input type="color" value={m.emissive} disabled={disabled} onChange={(e) => set({ emissive: e.target.value })} />
              </div>
              <Slider label="Glow amt" value={m.emissiveIntensity ?? 1} min={0} max={5} step={0.1} disabled={disabled} onChange={(v) => set({ emissiveIntensity: v })} />
            </>
          )}

          <MapSlot label="Base map" value={m.baseColorMap} options={texOptions} disabled={disabled} onBrowse={() => openAssets(true)} onChange={(u) => set({ baseColorMap: u })} />
          <MapSlot label="Normal" value={m.normalMap} options={texOptions} disabled={disabled} onBrowse={() => openAssets(true)} onChange={(u) => set({ normalMap: u })} />
          <MapSlot label="Rough map" value={m.roughnessMap} options={texOptions} disabled={disabled} onBrowse={() => openAssets(true)} onChange={(u) => set({ roughnessMap: u })} />
          <MapSlot label="Ambient occl." value={m.aoMap} options={texOptions} disabled={disabled} onBrowse={() => openAssets(true)} onChange={(u) => set({ aoMap: u })} />
          <MapSlot label="Emissive map" value={m.emissiveMap} options={texOptions} disabled={disabled} onBrowse={() => openAssets(true)} onChange={(u) => set({ emissiveMap: u })} />
        </>
      )}
    </>
  );
}

/** An entity's material config, falling back to defaults so the editor is always populated. */
export function materialOf(entity: Entity): MaterialConfig {
  return entity.mesh?.material ?? defaultMaterial();
}
