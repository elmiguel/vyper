import { useEffect, useRef } from 'react';
import { Bone, Play, Square, KeyRound } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import { getManager } from '@/babylon/engine';

/**
 * The Modeling Studio's Rigging + Animation panel: enter Rig Mode for a mesh, build and
 * pose a bone skeleton, auto-bind skin weights, then author keyframe clips on a timeline
 * and scrub/play them. Skeleton state is persisted on the entity (`entity.rig`); the live
 * skeleton + linear-blend-skin preview are owned by the scene's RigController.
 */
export function RiggingPanel() {
  const mode = useEditorStore((s) => s.mode);
  const entities = useEditorStore((s) => s.entities);
  const selectedId = useEditorStore((s) => s.selectedId);
  const rig = useEditorStore((s) => s.rig);
  const beginRig = useEditorStore((s) => s.beginRig);
  const endRig = useEditorStore((s) => s.endRig);
  const selectRigBone = useEditorStore((s) => s.selectRigBone);
  const addClip = useEditorStore((s) => s.addClip);
  const setActiveClip = useEditorStore((s) => s.setActiveClip);
  const keyframeBones = useEditorStore((s) => s.keyframeBones);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const setRigPlaying = useEditorStore((s) => s.setRigPlaying);

  const selected = entities.find((e) => e.id === selectedId);
  const is3d = mode === '3d';
  const editableKinds = new Set(['box', 'sphere', 'ground', 'plane', 'cylinder', 'cone', 'custom']);
  const canRig = is3d && !!selected?.mesh && editableKinds.has(selected.mesh.kind);
  const rigging = rig.active && rig.entityId === selectedId;
  const rigEntity = entities.find((e) => e.id === rig.entityId);
  const bones = rigEntity?.rig?.skeleton.bones ?? [];
  const clips = rigEntity?.rig?.clips ?? [];
  const activeClip = clips.find((c) => c.id === rig.activeClipId);
  const duration = activeClip?.duration ?? 2;

  // Playback loop: advance the playhead in real time while playing, looping the clip.
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!rig.playing || !activeClip) return;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      const next = rig.playhead + dt;
      setPlayhead(next > duration ? 0 : next);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [rig.playing, rig.playhead, activeClip, duration, setPlayhead]);

  return (
    <div className="panel modeling-tools">
      <div className="panel-head">Rigging</div>
      <div className="panel-scroll">
        {!is3d && <div className="empty-hint">Rigging is available in 3D mode.</div>}

        <div className="studio-section">
          <div className="studio-label"><Bone size={13} /> Armature</div>
          <button
            className={`studio-btn wide ${rigging ? 'active' : ''}`}
            disabled={!canRig}
            onClick={() => (rigging ? endRig() : selectedId && beginRig(selectedId))}
          >
            {rigging ? 'Exit Rig Mode' : 'Enter Rig Mode'}
          </button>
          {!canRig && is3d && <div className="empty-hint inline">Select a mesh to rig.</div>}

          {rigging && (
            <>
              <div className="studio-grid" style={{ marginTop: 8 }}>
                <button className="studio-btn" onClick={() => getManager()?.rigController?.addBone()}>
                  Add Bone
                </button>
                <button className="studio-btn" disabled={bones.length === 0} onClick={() => getManager()?.rigController?.autoWeight()}>
                  Auto Weight
                </button>
              </div>
              {bones.length > 0 && (
                <div className="rig-bone-list">
                  {bones.map((b) => (
                    <button
                      key={b.id}
                      className={`rig-bone ${rig.selectedBone === b.id ? 'active' : ''}`}
                      onClick={() => selectRigBone(rig.selectedBone === b.id ? null : b.id)}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              )}
              {bones.length === 0 && <div className="empty-hint inline">Add bones, then Auto Weight to bind the mesh.</div>}
            </>
          )}
        </div>

        {rigging && (
          <div className="studio-section">
            <div className="studio-label">Animation</div>
            <select className="studio-select" value={rig.activeClipId ?? ''} onChange={(e) => setActiveClip(e.target.value || null)}>
              <option value="">No clip</option>
              {clips.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="studio-grid">
              <button className="studio-btn" onClick={() => addClip()}>New Clip</button>
              <button className="studio-btn" disabled={!activeClip} onClick={() => keyframeBones()}>
                <KeyRound size={12} /> Key Pose
              </button>
            </div>
            {activeClip && (
              <>
                <label className="studio-slider">
                  Time <span>{rig.playhead.toFixed(2)}s</span>
                  <input
                    type="range" min={0} max={duration} step={0.01} value={Math.min(rig.playhead, duration)}
                    onChange={(e) => setPlayhead(Number(e.target.value))}
                  />
                </label>
                <div className="studio-grid">
                  <button className={`studio-btn ${rig.playing ? 'active' : ''}`} onClick={() => setRigPlaying(!rig.playing)}>
                    {rig.playing ? <><Square size={12} /> Stop</> : <><Play size={12} /> Play</>}
                  </button>
                  <span className="studio-hint">{activeClip.tracks.length} track(s)</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
