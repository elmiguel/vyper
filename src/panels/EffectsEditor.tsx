import { useEditorStore } from '@/store/editorStore';
import { EFFECT_PRESETS, presetsForMode } from '@/effects/presets';
import { EffectPreview } from '@/effects/EffectPreview';
import type { BlendMode, EffectConfig, EmitterShape, ParticleTextureKind, RGBA, Vec3 } from '@/types';
import { Sparkles, X } from 'lucide-react';

// ---- small RGBA <-> hex helpers ----
const toHex = (c: RGBA) =>
  '#' + [c[0], c[1], c[2]].map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string, alpha: number): RGBA => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
};

function Num({ label, value, onChange, step = 0.1, min }: { label: string; value: number; onChange: (n: number) => void; step?: number; min?: number }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        onWheel={(e) => e.currentTarget.blur()}
      />
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="field-val">{value.toFixed(2)}</span>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: RGBA; onChange: (c: RGBA) => void }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <input type="color" value={toHex(value)} onChange={(e) => onChange(fromHex(e.target.value, value[3]))} />
      <input
        type="range" min={0} max={1} step={0.05}
        title="alpha"
        value={value[3]}
        onChange={(e) => onChange([value[0], value[1], value[2], parseFloat(e.target.value)])}
      />
    </div>
  );
}

function VecField({ label, value, onChange }: { label: string; value: Vec3; onChange: (v: Vec3) => void }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {(['x', 'y', 'z'] as const).map((a) => (
        <input
          key={a}
          type="number"
          step={0.5}
          value={value[a]}
          onChange={(e) => onChange({ ...value, [a]: parseFloat(e.target.value) || 0 })}
          onWheel={(e) => e.currentTarget.blur()}
        />
      ))}
    </div>
  );
}

export function EffectsEditor() {
  const mode = useEditorStore((s) => s.mode);
  const activeEffect = useEditorStore((s) => s.activeEffect);
  const entity = useEditorStore((s) => s.entities.find((e) => e.id === activeEffect?.entityId));
  const updateEffect = useEditorStore((s) => s.updateEffect);
  const renameEffect = useEditorStore((s) => s.renameEffect);
  const setActiveEffect = useEditorStore((s) => s.setActiveEffect);

  const fx = entity?.effects?.find((f) => f.id === activeEffect?.effectId);

  // Docked drawer: hidden entirely until an effect is opened from the Inspector / FX button.
  if (!activeEffect || !entity || !fx) return null;

  const c = fx.config;
  const set = (patch: Partial<EffectConfig>) => updateEffect(entity.id, fx.id, patch);
  const setEmitter = (p: Partial<EffectConfig['emitter']>) => set({ emitter: { ...c.emitter, ...p } });
  const setPlayback = (p: Partial<EffectConfig['playback']>) => set({ playback: { ...c.playback, ...p } });

  return (
    <div className="panel fx-editor fx-dock">
      <div className="panel-head">
        <Sparkles size={13} /> Effects
        <span className="fx-on-entity">· {entity.name}</span>
        <button className="fx-close" title="Close" onClick={() => setActiveEffect(null)}>
          <X size={15} />
        </button>
      </div>

      <div className="fx-body">
        {/* Preset gallery */}
        <div className="fx-col fx-gallery-col">
          <h4>Presets</h4>
          <input
            className="name-input fx-name"
            value={fx.name}
            onChange={(e) => renameEffect(entity.id, fx.id, e.target.value)}
          />
          <div className="fx-gallery">
            {presetsForMode(mode).map((id) => (
              <button
                key={id}
                className={`fx-card ${fx.preset === id ? 'active' : ''}`}
                title={`Apply ${EFFECT_PRESETS[id].label}`}
                onClick={() => {
                  set(structuredClone(EFFECT_PRESETS[id].config));
                  renameEffect(entity.id, fx.id, EFFECT_PRESETS[id].label);
                }}
              >
                <span className="fx-card-dot" />
                {EFFECT_PRESETS[id].label}
              </button>
            ))}
          </div>
        </div>

        {/* Parameters */}
        <div className="fx-col fx-params-col">
          <section>
            <h4>Emission</h4>
            <Num label="Rate" value={c.emitRate} step={5} min={0} onChange={(emitRate) => set({ emitRate })} />
            <Num label="Capacity" value={c.capacity} step={100} min={1} onChange={(capacity) => set({ capacity })} />
          </section>

          <section>
            <h4>Shape</h4>
            <div className="field">
              <span className="field-label">Emitter</span>
              <select value={c.emitter.shape} onChange={(e) => setEmitter({ shape: e.target.value as EmitterShape })}>
                {(['point', 'box', 'sphere', 'cone'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {(c.emitter.shape === 'sphere' || c.emitter.shape === 'cone') && (
              <Num label="Radius" value={c.emitter.radius} onChange={(radius) => setEmitter({ radius })} />
            )}
            {c.emitter.shape === 'cone' && (
              <Slider label="Angle" min={0} max={1.5} step={0.05} value={c.emitter.angle} onChange={(angle) => setEmitter({ angle })} />
            )}
          </section>

          <section>
            <h4>Size & Life</h4>
            <Num label="Size min" value={c.minSize} onChange={(minSize) => set({ minSize })} />
            <Num label="Size max" value={c.maxSize} onChange={(maxSize) => set({ maxSize })} />
            <Num label="Life min" value={c.minLifeTime} onChange={(minLifeTime) => set({ minLifeTime })} />
            <Num label="Life max" value={c.maxLifeTime} onChange={(maxLifeTime) => set({ maxLifeTime })} />
          </section>

          <section>
            <h4>Motion</h4>
            <Num label="Power min" value={c.minEmitPower} onChange={(minEmitPower) => set({ minEmitPower })} />
            <Num label="Power max" value={c.maxEmitPower} onChange={(maxEmitPower) => set({ maxEmitPower })} />
            <VecField label="Gravity" value={c.gravity} onChange={(gravity) => set({ gravity })} />
          </section>

          <section>
            <h4>Color & Render</h4>
            <ColorField label="Start" value={c.color1} onChange={(color1) => set({ color1 })} />
            <ColorField label="Start 2" value={c.color2} onChange={(color2) => set({ color2 })} />
            <ColorField label="End" value={c.colorDead} onChange={(colorDead) => set({ colorDead })} />
            <div className="field">
              <span className="field-label">Blend</span>
              <select value={c.blendMode} onChange={(e) => set({ blendMode: e.target.value as BlendMode })}>
                {(['ADD', 'STANDARD', 'ONEONE', 'MULTIPLY'] as const).map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="field">
              <span className="field-label">Sprite</span>
              <select value={c.texture} onChange={(e) => set({ texture: e.target.value as ParticleTextureKind })}>
                {(['soft', 'spark', 'smoke', 'star', 'circle'] as const).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <label className="field check">
              <input type="checkbox" checked={c.billboard} onChange={(e) => set({ billboard: e.target.checked })} /> Billboard
            </label>
            <label className="field check">
              <input type="checkbox" checked={c.useGPU} onChange={(e) => set({ useGPU: e.target.checked })} /> GPU particles
            </label>
          </section>

          <section>
            <h4>Playback</h4>
            <div className="field">
              <span className="field-label">Trigger</span>
              <select value={c.playback.mode} onChange={(e) => setPlayback({ mode: e.target.value as 'auto' | 'manual' })}>
                <option value="auto">auto (on Play)</option>
                <option value="manual">manual (triggered)</option>
              </select>
            </div>
            <label className="field check">
              <input type="checkbox" checked={c.playback.loop} onChange={(e) => setPlayback({ loop: e.target.checked })} /> Loop
            </label>
            {!c.playback.loop && (
              <Num label="Duration" value={c.playback.duration} step={0.1} min={0} onChange={(duration) => setPlayback({ duration })} />
            )}
            <Num label="Delay" value={c.playback.delay} step={0.1} min={0} onChange={(delay) => setPlayback({ delay })} />
          </section>
        </div>

        {/* Live isolated preview */}
        <div className="fx-col fx-preview-col">
          <h4>Preview</h4>
          <EffectPreview config={c} mode={mode} />
        </div>
      </div>
    </div>
  );
}
