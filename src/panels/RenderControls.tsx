import { useEditorStore } from '@/store/editorStore';
import { defaultRenderSettings, defaultGrass, type RenderSettings as RS, type GrassConfig } from '@/types';
import { Check, Slider } from './controls';

/**
 * The "look" knobs that the Game Style presets bundle: colour grade (saturation /
 * warm-cool split), lens effects (chromatic aberration, depth-of-field, sharpen),
 * camera FOV, and volumetric god rays. Edits go to `design.render` via
 * `updateRenderSettings` (which clears the active preset id, so the gallery shows
 * "Custom"). The existing Effects/Shadows/Environment controls live in
 * <RenderSettings/>, which the Game Style panel renders alongside this.
 */
export function RenderControls() {
  const stored = useEditorStore((s) => s.design.render);
  const render = { ...defaultRenderSettings(), ...(stored ?? {}) };
  const update = useEditorStore((s) => s.updateRenderSettings);
  const selectedId = useEditorStore((s) => s.selectedId);
  const selected = useEditorStore((s) => s.entities.find((e) => e.id === s.selectedId));
  const updateMesh = useEditorStore((s) => s.updateMesh);
  const set = (patch: Partial<RS>) => update(patch);

  const grass = selected?.mesh?.grass;
  const canGrass = !!selected?.mesh && selected.mesh.kind !== 'model';
  const setGrass = (patch: Partial<GrassConfig>) =>
    selectedId && updateMesh(selectedId, { grass: { ...defaultGrass(), ...(grass ?? {}), ...patch } });

  if (!render.enabled) {
    return <div className="empty-hint inline">Enable “High-quality rendering” below to use look effects.</div>;
  }

  return (
    <>
      <section>
        <h4>Colour grade</h4>
        <Slider label="Saturation" value={render.saturation} min={-100} max={100} step={1} onChange={(v) => set({ saturation: v })} />
        <Slider label="Warm / cool" value={render.warmth} min={-1} max={1} step={0.05} onChange={(v) => set({ warmth: v })} />
      </section>

      <section>
        <h4>Lens</h4>
        <Slider label="Field of view (°)" value={render.fov} min={20} max={110} step={1} onChange={(v) => set({ fov: v })} />
        <Check label="Chromatic aberration" checked={render.chromaticAberration} onChange={(v) => set({ chromaticAberration: v })} />
        {render.chromaticAberration && (
          <Slider label="Fringe amount" value={render.chromaticAberrationAmount} min={0} max={5} step={0.1} onChange={(v) => set({ chromaticAberrationAmount: v })} />
        )}
        <Check label="Sharpen" checked={render.sharpen} onChange={(v) => set({ sharpen: v })} />
        {render.sharpen && (
          <Slider label="Sharpen amount" value={render.sharpenAmount} min={0} max={1} step={0.05} onChange={(v) => set({ sharpenAmount: v })} />
        )}
        <Check label="Depth of field" checked={render.dof} onChange={(v) => set({ dof: v })} />
        {render.dof && (
          <>
            <Slider label="Focus dist (mm)" value={render.dofFocusDistance} min={500} max={30000} step={100} onChange={(v) => set({ dofFocusDistance: v })} />
            <Slider label="Aperture (f)" value={render.dofFStop} min={1.2} max={11} step={0.1} onChange={(v) => set({ dofFStop: v })} />
            <Slider label="Focal length (mm)" value={render.dofFocalLength} min={20} max={200} step={1} onChange={(v) => set({ dofFocalLength: v })} />
            <div className="field">
              <span className="field-label">Blur quality</span>
              <select value={render.dofBlur} onChange={(e) => set({ dofBlur: e.target.value as RS['dofBlur'] })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </>
        )}
      </section>

      <section>
        <h4>Volumetric</h4>
        <Check label="God rays (light shafts)" checked={render.godRays} onChange={(v) => set({ godRays: v })} />
        {render.godRays && (
          <Slider label="Ray intensity" value={render.godRaysIntensity} min={0} max={2} step={0.05} onChange={(v) => set({ godRaysIntensity: v })} />
        )}
        <div className="empty-hint inline">God rays radiate from the scene’s directional light.</div>
      </section>

      <section>
        <h4>Grass</h4>
        {!grass ? (
          <>
            <button
              className="add-script-btn"
              disabled={!canGrass}
              title={canGrass ? 'Scatter wind-blown grass blades over the selected mesh (e.g. terrain)' : 'Select a terrain or primitive mesh first'}
              onClick={() => selectedId && updateMesh(selectedId, { grass: defaultGrass() })}
            >
              Add grass to selection
            </button>
            <div className="empty-hint inline">
              {canGrass ? 'Grows a field of blades over the selected surface.' : 'Select a terrain (or primitive) mesh to grow grass on it.'}
            </div>
          </>
        ) : (
          <>
            <Slider label="Density" value={grass.density} min={0.5} max={30} step={0.5} onChange={(v) => setGrass({ density: v })} />
            <Slider label="Blade height" value={grass.bladeHeight} min={0.1} max={3} step={0.05} onChange={(v) => setGrass({ bladeHeight: v })} />
            <Slider label="Blade width" value={grass.bladeWidth} min={0.02} max={0.5} step={0.01} onChange={(v) => setGrass({ bladeWidth: v })} />
            <div className="field">
              <span className="field-label">Colour</span>
              <input type="color" value={grass.color} onChange={(e) => setGrass({ color: e.target.value })} />
            </div>
            <div className="field">
              <span className="field-label">Rim glow</span>
              <input type="color" value={grass.rimColor} onChange={(e) => setGrass({ rimColor: e.target.value })} />
            </div>
            <Slider label="Rim intensity" value={grass.rimIntensity} min={0} max={2} step={0.05} onChange={(v) => setGrass({ rimIntensity: v })} />
            <Slider label="Wind strength" value={grass.windStrength} min={0} max={0.6} step={0.01} onChange={(v) => setGrass({ windStrength: v })} />
            <Slider label="Wind speed" value={grass.windSpeed} min={0} max={5} step={0.1} onChange={(v) => setGrass({ windSpeed: v })} />
            <button
              className="add-script-btn"
              onClick={() => selectedId && updateMesh(selectedId, { grass: undefined })}
            >
              Remove grass
            </button>
          </>
        )}
      </section>
    </>
  );
}
