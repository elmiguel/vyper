import { useEffect, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { getRuntime } from '@/babylon/engine';
import { GAME_CAMERA_ID } from '@/babylon/editorObjects';
import { physicsModeOf, type Vec3 } from '@/types';
import { Plus, Power, RotateCcw, Sparkles, Boxes } from 'lucide-react';
import { NumberInput } from '@/ui/NumberInput';
import { EFFECT_PRESETS, presetsForMode } from '@/effects/presets';
import { RenderSettings } from './RenderSettings';
import { MaterialEditor } from './MaterialEditor';
import { TerrainPanel } from './TerrainPanel';
import { ModelingPanel } from './ModelingPanel';
import { PrefabsPanel } from './PrefabsPanel';
import { VolumePanel } from './VolumePanel';

// Trim float noise (e.g. live-play transforms) to 3 decimals when not editing.
const trim3 = (v: number) => String(Number(v.toFixed(3)));

function Vec3Row({ label, value, onChange, disabled }: { label: string; value: Vec3; onChange: (v: Vec3) => void; disabled?: boolean }) {
  return (
    <div className="vec-row">
      <span className="field-label">{label}</span>
      {(['x', 'y', 'z'] as const).map((a) => (
        <NumberInput
          key={a}
          step={0.1}
          disabled={disabled}
          value={value[a]}
          display={trim3}
          onChange={(n) => onChange({ ...value, [a]: n })}
        />
      ))}
    </div>
  );
}

export function Inspector() {
  const selectedId = useEditorStore((s) => s.selectedId);
  const entity = useEditorStore((s) => s.entities.find((e) => e.id === s.selectedId));
  const playState = useEditorStore((s) => s.playState);
  const { updateTransform, updateMesh, updateLight, setPhysics, setProp, addScript, detachScript, toggleScriptEnabled, setActiveScript } = useEditorStore();
  const mode = useEditorStore((s) => s.mode);
  const { addEffect, removeEffect, toggleEffectEnabled, setActiveEffect } = useEditorStore();
  const setTrigger = useEditorStore((s) => s.setTrigger);
  const setEntityTag = useEditorStore((s) => s.setEntityTag);
  const gameCamera = useEditorStore((s) => s.gameCamera);
  const updateGameCamera = useEditorStore((s) => s.updateGameCamera);
  const resetGameCamera = useEditorStore((s) => s.resetGameCamera);
  const scripts = useEditorStore((s) => s.scripts);
  const savePrefab = useEditorStore((s) => s.savePrefab);
  const [, tick] = useState(0);
  const [newProp, setNewProp] = useState('');
  const [addingFx, setAddingFx] = useState(false);

  // While playing, re-read live transforms each frame for a "live debugger" feel.
  useEffect(() => {
    if (playState !== 'playing') return;
    let raf = 0;
    const loop = () => {
      tick((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playState]);

  if (selectedId === GAME_CAMERA_ID) {
    return (
      <div className="panel inspector" data-tour="inspector">
        <div className="panel-head">Inspector</div>
        <div className="panel-scroll">
          <input className="name-input" value="Game Camera" disabled />
          <section>
            <h4>Camera Transform</h4>
            <Vec3Row label="Position" value={gameCamera.position} onChange={(v) => updateGameCamera({ position: v })} />
            <Vec3Row label="Rotation" value={gameCamera.rotation} onChange={(v) => updateGameCamera({ rotation: v })} />
            <button className="add-script-btn" onClick={resetGameCamera}>
              <RotateCcw size={13} /> Reset to default
            </button>
          </section>
          <div className="empty-hint inline">
            Renders the Game preview. Move its rig in the Scene view or edit values here.
          </div>
        </div>
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="panel inspector" data-tour="inspector">
        <div className="panel-head">Inspector</div>
        <div className="panel-scroll">
          <div className="empty-hint">Select an object to inspect it.</div>
          <PrefabsPanel />
          <RenderSettings />
        </div>
      </div>
    );
  }

  const live = playState !== 'editing' ? getRuntime()?.liveTransform(entity.id) : null;
  const pos = live?.position ?? entity.transform.position;
  const rot = live?.rotation ?? entity.transform.rotation;
  const playing = playState !== 'editing';

  return (
    <div className="panel inspector" data-tour="inspector">
      <div className="panel-head">
        Inspector
        {playing && <span className="live-pill">● live</span>}
      </div>
      <div className="panel-scroll">
        <input
          className="name-input"
          value={entity.name}
          onChange={(e) => useEditorStore.getState().renameEntity(entity.id, e.target.value)}
        />
        <div className="field tag-field">
          <span className="field-label">Tag</span>
          <input
            placeholder="group (e.g. player, enemy)"
            value={entity.tag ?? ''}
            disabled={playing}
            onChange={(e) => setEntityTag(entity.id, e.target.value)}
          />
        </div>

        <section>
          <h4>Transform</h4>
          <Vec3Row label="Position" value={pos} disabled={playing} onChange={(v) => updateTransform(entity.id, { position: v })} />
          <Vec3Row label="Rotation" value={rot} disabled={playing} onChange={(v) => updateTransform(entity.id, { rotation: v })} />
          <Vec3Row label="Scale" value={entity.transform.scale} disabled={playing} onChange={(v) => updateTransform(entity.id, { scale: v })} />
        </section>

        {entity.mesh && (
          <section>
            <h4>Mesh · {entity.mesh.kind}</h4>
            <div className="field">
              <span className="field-label">Color</span>
              <input type="color" value={entity.mesh.color} onChange={(e) => updateMesh(entity.id, { color: e.target.value })} />
            </div>
            {entity.mesh.kind !== 'model' && <MaterialEditor entity={entity} disabled={playing} />}
            {entity.mesh.kind === 'terrain' && <TerrainPanel entity={entity} disabled={playing} />}
            {entity.mesh.kind !== 'model' && entity.mesh.kind !== 'terrain' && <ModelingPanel entity={entity} disabled={playing} />}
            <label className="field check">
              <input type="checkbox" checked={entity.mesh.visible} onChange={(e) => updateMesh(entity.id, { visible: e.target.checked })} />
              Visible
            </label>
            <label className="field check">
              <input
                type="checkbox"
                checked={entity.mesh.collision !== false}
                onChange={(e) => updateMesh(entity.id, { collision: e.target.checked })}
              />
              Collision
            </label>
          </section>
        )}

        {entity.light && (
          <section>
            <h4>Light · {entity.light.kind}</h4>
            <div className="field">
              <span className="field-label">Color</span>
              <input type="color" value={entity.light.color} onChange={(e) => updateLight(entity.id, { color: e.target.value })} />
            </div>
            <div className="field">
              <span className="field-label">Intensity</span>
              <input
                type="range" min={0} max={3} step={0.05}
                value={entity.light.intensity}
                onChange={(e) => updateLight(entity.id, { intensity: parseFloat(e.target.value) })}
              />
              <span className="field-val">{entity.light.intensity.toFixed(2)}</span>
            </div>
          </section>
        )}

        {entity.mesh && (() => {
          const mode = physicsModeOf(entity.physics);
          return (
          <section>
            <h4>Physics</h4>
            <label className="field check" title="Static collider — blocks the player and never moves. Use for walls, floating platforms, and other static obstacles.">
              <input
                type="checkbox"
                checked={mode === 'solid'}
                disabled={playing}
                onChange={(e) => setPhysics(entity.id, e.target.checked ? { enabled: true, type: 'static' } : { enabled: false })}
              />
              Solid (static collider)
            </label>
            <label className="field check" title="Dynamic rigid body — simulated by physics, falls and reacts to forces and collisions.">
              <input
                type="checkbox"
                checked={mode === 'rigid'}
                disabled={playing}
                onChange={(e) => setPhysics(entity.id, e.target.checked ? { enabled: true, type: 'dynamic' } : { enabled: false })}
              />
              Rigid body
            </label>
            {mode === 'rigid' && (
              <>
                <div className="field">
                  <span className="field-label">Type</span>
                  <select
                    value={entity.physics!.type}
                    disabled={playing}
                    onChange={(e) => setPhysics(entity.id, { type: e.target.value as NonNullable<typeof entity.physics>['type'] })}
                  >
                    <option value="dynamic">dynamic</option>
                    <option value="kinematic">kinematic</option>
                  </select>
                </div>
                <div className="field">
                  <span className="field-label">Shape</span>
                  <select
                    value={entity.physics!.shape}
                    disabled={playing}
                    onChange={(e) => setPhysics(entity.id, { shape: e.target.value as NonNullable<typeof entity.physics>['shape'] })}
                  >
                    <option value="auto">auto</option>
                    <option value="box">box</option>
                    <option value="sphere">sphere</option>
                    <option value="capsule">capsule</option>
                    <option value="cylinder">cylinder</option>
                  </select>
                </div>
                <div className="field">
                  <span className="field-label">Mass</span>
                  <NumberInput
                    step={0.1}
                    value={entity.physics!.mass}
                    disabled={playing}
                    onChange={(n) => setPhysics(entity.id, { mass: Math.max(0, n) })}
                  />
                </div>
                <div className="field">
                  <span className="field-label">Bounce</span>
                  <input
                    type="range" min={0} max={1} step={0.05}
                    value={entity.physics!.restitution}
                    disabled={playing}
                    onChange={(e) => setPhysics(entity.id, { restitution: parseFloat(e.target.value) })}
                  />
                  <span className="field-val">{entity.physics!.restitution.toFixed(2)}</span>
                </div>
                <div className="field">
                  <span className="field-label">Friction</span>
                  <input
                    type="range" min={0} max={1} step={0.05}
                    value={entity.physics!.friction}
                    disabled={playing}
                    onChange={(e) => setPhysics(entity.id, { friction: parseFloat(e.target.value) })}
                  />
                  <span className="field-val">{entity.physics!.friction.toFixed(2)}</span>
                </div>
              </>
            )}
          </section>
          );
        })()}

        <section>
          <h4>Properties</h4>
          {Object.entries(live?.props ?? entity.props).map(([k, v]) => (
            <div className="field" key={k}>
              <span className="field-label">{k}</span>
              <input
                value={String(v)}
                disabled={playing}
                onChange={(e) => {
                  const raw = e.target.value;
                  const num = parseFloat(raw);
                  setProp(entity.id, k, raw !== '' && !isNaN(num) && String(num) === raw ? num : raw);
                }}
              />
            </div>
          ))}
          {!playing && (
            <div className="field add-prop">
              <input placeholder="new property" value={newProp} onChange={(e) => setNewProp(e.target.value)} />
              <button
                disabled={!newProp.trim()}
                onClick={() => { setProp(entity.id, newProp.trim(), 0); setNewProp(''); }}
              >
                <Plus size={13} />
              </button>
            </div>
          )}
        </section>

        {entity.mesh && (
          <section>
            <h4>Trigger Volume</h4>
            <label className="field check">
              <input
                type="checkbox"
                checked={!!entity.trigger?.enabled}
                disabled={playing}
                onChange={(e) => setTrigger(entity.id, { enabled: e.target.checked })}
              />
              Is a trigger zone
            </label>
            {entity.trigger?.enabled && (
              <>
                <label className="field check">
                  <input
                    type="checkbox"
                    checked={!!entity.trigger.once}
                    disabled={playing}
                    onChange={(e) => setTrigger(entity.id, { once: e.target.checked })}
                  />
                  Fire only once
                </label>
                <div className="field">
                  <span className="field-label">Only</span>
                  <input
                    placeholder="any object (or names, comma-sep)"
                    disabled={playing}
                    value={entity.trigger.filter.join(', ')}
                    onChange={(e) =>
                      setTrigger(entity.id, {
                        filter: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                      })
                    }
                  />
                </div>
                <VolumePanel entity={entity} disabled={playing} />
                <div className="empty-hint inline">
                  Add a behaviour with an <em>On Trigger Enter/Exit/Stay</em> node to react. Hidden in the game view.
                </div>
              </>
            )}
          </section>
        )}

        <section>
          <h4>Effects</h4>
          {(entity.effects ?? []).map((fx) => (
            <div className="script-row" key={fx.id}>
              <button
                className={`script-power ${fx.enabled ? 'on' : ''}`}
                title="Enable/disable"
                onClick={() => toggleEffectEnabled(entity.id, fx.id)}
              >
                <Power size={12} />
              </button>
              <span className="script-name" onClick={() => setActiveEffect({ entityId: entity.id, effectId: fx.id })}>
                {fx.name} <em>· {fx.config.playback.mode}</em>
              </span>
              <button className="script-detach" onClick={() => removeEffect(entity.id, fx.id)}>✕</button>
            </div>
          ))}
          {addingFx ? (
            <div className="fx-add-grid">
              {presetsForMode(mode).map((id) => (
                <button
                  key={id}
                  className="fx-add-item"
                  onClick={() => {
                    addEffect(entity.id, id);
                    setAddingFx(false);
                  }}
                >
                  {EFFECT_PRESETS[id].label}
                </button>
              ))}
            </div>
          ) : (
            <button className="add-script-btn" onClick={() => setAddingFx(true)}>
              <Sparkles size={13} /> Add Effect
            </button>
          )}
        </section>

        <section>
          <h4>Scripts</h4>
          {entity.scriptIds.map((sid) => {
            const sc = scripts[sid];
            if (!sc) return null;
            return (
              <div className="script-row" key={sid}>
                <button className={`script-power ${sc.enabled ? 'on' : ''}`} title="Enable/disable" onClick={() => toggleScriptEnabled(sid)}>
                  <Power size={12} />
                </button>
                <span className="script-name" onClick={() => setActiveScript(sid)}>
                  {sc.name} <em>· {sc.mode}</em>
                </span>
                <button className="script-detach" onClick={() => detachScript(entity.id, sid)}>✕</button>
              </div>
            );
          })}
          <button className="add-script-btn" onClick={() => addScript(entity.id)}>
            <Plus size={13} /> Add Behaviour
          </button>
        </section>

        <section>
          <h4>Prefab</h4>
          <button className="add-script-btn" disabled={playing} onClick={() => savePrefab(entity.id, entity.name)}>
            <Boxes size={13} /> Save as Prefab
          </button>
        </section>
      </div>
    </div>
  );
}
