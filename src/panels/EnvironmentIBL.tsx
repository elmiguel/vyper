import { useEditorStore } from '@/store/editorStore';
import { defaultRenderSettings } from '@/types';

/** A labelled range slider with a numeric read-out, matching `.field`. */
function Slider({
  label, value, min, max, step, onChange,
}: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="field-val">{value.toFixed(2)}</span>
    </div>
  );
}

/**
 * Image-based-lighting (environment) controls for a scene — intensity, skybox toggle, and clear.
 * The HDRI/.env texture is imported from the asset browser (CC0 tab), which sets
 * `design.render.environmentUrl`. Shared by {@link RenderSettings} (Inspector, no selection) and
 * the Modeling panel's Lookdev section (reachable while editing a mesh), so environment lookdev
 * works in both places off the one render-settings source — replacing the retired Studio's
 * separate StudioEnv preview.
 */
export function EnvironmentIBL() {
  const storedRender = useEditorStore((s) => s.design.render);
  const render = { ...defaultRenderSettings(), ...(storedRender ?? {}) };
  const update = useEditorStore((s) => s.updateRenderSettings);

  return (
    <section>
      <h4>Environment (IBL)</h4>
      {render.environmentUrl ? (
        <>
          <Slider label="Intensity" value={render.environmentIntensity} min={0} max={3} step={0.05} onChange={(v) => update({ environmentIntensity: v })} />
          <label className="field check">
            <input type="checkbox" checked={render.skybox} onChange={(e) => update({ skybox: e.target.checked })} />
            Show as skybox
          </label>
          <button className="add-script-btn" onClick={() => update({ environmentUrl: '', skybox: false })}>Clear environment</button>
        </>
      ) : (
        <div className="empty-hint inline">
          Import an environment (.env / HDRI) from the asset browser for reflections and ambient light.
        </div>
      )}
    </section>
  );
}
