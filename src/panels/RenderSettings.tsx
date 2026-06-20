import { useEditorStore } from '@/store/editorStore';
import { defaultRenderSettings, type RenderSettings as RS } from '@/types';
import { EnvironmentIBL } from './EnvironmentIBL';

/** A labelled checkbox row, matching the Inspector's `.field check` style. */
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="field check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** A labelled range slider with a numeric read-out, matching `.field`. */
function Slider({
  label, value, min, max, step, onChange,
}: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="field-val">{value.toFixed(step < 0.01 ? 4 : 2)}</span>
    </div>
  );
}

/**
 * Scene-wide high-quality rendering controls (3D only): the post-processing
 * pipeline, shadows and image-based lighting. Shown in the Inspector when nothing
 * is selected. Edits go to `design.render`, which the engine watches and applies.
 */
export function RenderSettings() {
  const mode = useEditorStore((s) => s.mode);
  // Merge over defaults so a render block persisted before newer fields existed
  // (e.g. shadow controls) never yields `undefined` slider values.
  const storedRender = useEditorStore((s) => s.design.render);
  const render = { ...defaultRenderSettings(), ...(storedRender ?? {}) };
  const update = useEditorStore((s) => s.updateRenderSettings);
  const editorEffects = useEditorStore((s) => s.editorEffects);
  const toggleEditorEffects = useEditorStore((s) => s.toggleEditorEffects);

  if (mode === '2d') {
    return (
      <section>
        <h4>Rendering</h4>
        <div className="empty-hint inline">High-quality rendering applies to 3D games. This is a 2D game.</div>
      </section>
    );
  }

  const set = (patch: Partial<RS>) => update(patch);

  return (
    <>
      <section>
        <h4>Rendering</h4>
        <Check label="Show effects in editor view" checked={editorEffects} onChange={() => toggleEditorEffects()} />
        <Check label="High-quality rendering" checked={render.enabled} onChange={(v) => set({ enabled: v })} />
        {render.enabled && (
          <>
            <div className="field">
              <span className="field-label">Tone map</span>
              <select value={render.tone} onChange={(e) => set({ tone: e.target.value as RS['tone'] })}>
                <option value="none">None (raw)</option>
                <option value="standard">Standard</option>
                <option value="aces">ACES (filmic)</option>
              </select>
            </div>
            <Slider label="Exposure" value={render.exposure} min={0} max={3} step={0.05} onChange={(v) => set({ exposure: v })} />
            <Slider label="Contrast" value={render.contrast} min={0} max={3} step={0.05} onChange={(v) => set({ contrast: v })} />
          </>
        )}
      </section>

      {render.enabled && (
        <>
          <section>
            <h4>Effects</h4>
            <Check label="Bloom" checked={render.bloom} onChange={(v) => set({ bloom: v })} />
            {render.bloom && (
              <Slider label="Bloom amt" value={render.bloomIntensity} min={0} max={1} step={0.01} onChange={(v) => set({ bloomIntensity: v })} />
            )}
            <Check label="Anti-aliasing (FXAA)" checked={render.fxaa} onChange={(v) => set({ fxaa: v })} />
            <Check label="Ambient occlusion (SSAO)" checked={render.ssao} onChange={(v) => set({ ssao: v })} />
            {render.ssao && (
              <Slider label="AO strength" value={render.ssaoIntensity} min={0} max={2} step={0.05} onChange={(v) => set({ ssaoIntensity: v })} />
            )}
            <Check label="Vignette" checked={render.vignette} onChange={(v) => set({ vignette: v })} />
            <Check label="Film grain" checked={render.grain} onChange={(v) => set({ grain: v })} />
          </section>

          <section>
            <h4>Shadows</h4>
            <Check label="Dynamic shadows" checked={render.shadows} onChange={(v) => set({ shadows: v })} />
            {render.shadows && (
              <>
                <div className="field">
                  <span className="field-label">Edge</span>
                  <select value={render.shadowType} onChange={(e) => set({ shadowType: e.target.value as RS['shadowType'] })}>
                    <option value="hard">Hard (crisp)</option>
                    <option value="soft">Soft (PCF)</option>
                    <option value="contact">Contact-hardening</option>
                  </select>
                </div>
                {render.shadowType !== 'hard' && (
                  <Slider label="Softness" value={render.shadowSoftness} min={0} max={1} step={0.01} onChange={(v) => set({ shadowSoftness: v })} />
                )}
                <Slider label="Darkness" value={render.shadowDarkness} min={0} max={1} step={0.01} onChange={(v) => set({ shadowDarkness: v })} />
                <div className="field">
                  <span className="field-label">Resolution</span>
                  <select
                    value={render.shadowQuality}
                    onChange={(e) => set({ shadowQuality: Number(e.target.value) as RS['shadowQuality'] })}
                  >
                    <option value={512}>Low (512)</option>
                    <option value={1024}>Medium (1024)</option>
                    <option value={2048}>High (2048)</option>
                  </select>
                </div>
                <Slider label="Bias" value={render.shadowBias} min={0} max={0.005} step={0.0001} onChange={(v) => set({ shadowBias: v })} />
                <Slider label="Normal bias" value={render.shadowNormalBias} min={0} max={0.1} step={0.005} onChange={(v) => set({ shadowNormalBias: v })} />
              </>
            )}
          </section>

          <EnvironmentIBL />
        </>
      )}
    </>
  );
}
