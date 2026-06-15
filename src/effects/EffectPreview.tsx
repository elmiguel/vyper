import { useEffect, useRef, useState } from 'react';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { Vector3, Color4 } from '@babylonjs/core/Maths/math';
import type { IParticleSystem } from '@babylonjs/core/Particles/IParticleSystem';
import { Play, Square, Repeat } from 'lucide-react';
import type { EffectConfig, GameMode } from '@/types';
import { buildParticleSystem } from '@/babylon/effects';

type PreviewMode = 'loop' | 'once' | 'stopped';

/**
 * Self-contained particle preview: owns its OWN Babylon engine + scene + camera on
 * a dedicated canvas, isolated from the game scene. Rebuilds the system from the
 * live config so what you see is exactly what `buildParticleSystem` produces in-game.
 */
export function EffectPreview({ config, mode }: { config: EffectConfig; mode: GameMode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const camRef = useRef<ArcRotateCamera | null>(null);
  const psRef = useRef<IParticleSystem | null>(null);
  const [play, setPlay] = useState<PreviewMode>('loop');

  // Create the engine/scene once.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.024, 0.024, 0.06, 1);
    const cam = new ArcRotateCamera('prev', -Math.PI / 2, Math.PI / 2.4, 9, new Vector3(0, 0, 0), scene);
    cam.attachControl(canvas, true);
    cam.lowerRadiusLimit = 3;
    cam.upperRadiusLimit = 30;
    cam.wheelPrecision = 30;
    sceneRef.current = scene;
    camRef.current = cam;
    engine.runRenderLoop(() => scene.render());
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      psRef.current?.dispose();
      psRef.current = null;
      scene.dispose();
      engine.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Frame the camera for 2D (head-on) vs 3D (angled orbit).
  useEffect(() => {
    const cam = camRef.current;
    if (!cam) return;
    if (mode === '2d') {
      cam.mode = Camera.ORTHOGRAPHIC_CAMERA;
      cam.setPosition(new Vector3(0, 0, -12));
      cam.alpha = -Math.PI / 2;
      cam.beta = Math.PI / 2;
      const h = 6;
      cam.orthoTop = h;
      cam.orthoBottom = -h;
      cam.orthoLeft = -h * 1.4;
      cam.orthoRight = h * 1.4;
    } else {
      cam.mode = Camera.PERSPECTIVE_CAMERA;
      cam.alpha = -Math.PI / 2;
      cam.beta = Math.PI / 2.4;
      cam.radius = 9;
    }
  }, [mode]);

  // Rebuild the particle system whenever the config or transport mode changes.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    psRef.current?.dispose();
    psRef.current = null;
    if (play === 'stopped') return;
    // For preview we override looping so edits are continuously visible (loop),
    // or run a single timed burst (once).
    const previewConfig: EffectConfig = {
      ...config,
      playback: { ...config.playback, loop: play === 'loop' },
    };
    const ps = buildParticleSystem(scene, previewConfig, { x: 0, y: 0, z: 0 }, 'preview');
    ps.disposeOnStop = false; // we manage disposal
    psRef.current = ps;
    ps.start();
  }, [config, play]);

  return (
    <div className="fx-preview">
      <canvas ref={canvasRef} className="fx-preview-canvas" />
      <div className="fx-transport">
        <button className={`mini-btn ${play === 'loop' ? 'on' : ''}`} title="Loop preview" onClick={() => setPlay('loop')}>
          <Repeat size={13} /> Loop
        </button>
        <button
          className="mini-btn"
          title="Play once"
          // Re-trigger a single burst even if already in 'once' mode.
          onClick={() => { setPlay('stopped'); requestAnimationFrame(() => setPlay('once')); }}
        >
          <Play size={13} /> Once
        </button>
        <button className={`mini-btn ${play === 'stopped' ? 'on' : ''}`} title="Stop" onClick={() => setPlay('stopped')}>
          <Square size={13} /> Stop
        </button>
      </div>
    </div>
  );
}
