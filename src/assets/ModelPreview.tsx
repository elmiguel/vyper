import { useEffect, useRef, useState } from 'react';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3, Color3 } from '@babylonjs/core/Maths/math';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Play, Pause, Loader2, AlertTriangle } from 'lucide-react';
import '@/babylon/loaders'; // ensure OBJ/glTF loaders are registered (idempotent)
import { defaultImportTransform, type Asset } from '@/types';
import { ASSET_ROOT } from '@/store/slices/assetSlice';
import { buildCustomMesh } from '@/babylon/customMesh';
import { computeModelTransform, type Bounds } from './modelTransform';

const DEG = Math.PI / 180;
const hexToColor3 = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return new Color3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/**
 * Isolated 3D preview of a single model asset. Spins up its own Babylon engine +
 * scene + orbit camera on a private canvas (NOT the editor's shared engine), loads
 * the asset under a root node, then live-applies the asset's import transform and
 * material tint whenever they change. Fully torn down on unmount / asset change.
 */
export function ModelPreview({ asset }: { asset: Asset }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);
  const rootRef = useRef<TransformNode | null>(null);
  const meshesRef = useRef<AbstractMesh[]>([]);
  const boundsRef = useRef<Bounds | null>(null);
  const groupsRef = useRef<AnimationGroup[]>([]);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [groups, setGroups] = useState<string[]>([]);
  const [playing, setPlaying] = useState(false);

  const transform = asset.importTransform ?? defaultImportTransform();
  const transformKey = JSON.stringify(transform);
  const colorHex = asset.material?.colorHex;
  const doubleSided = asset.material?.doubleSided;

  // ----- Load (engine lifecycle) — re-runs only when the asset file changes. -----
  useEffect(() => {
    const canvas = canvasRef.current;
    // Generated Modeling-Studio assets carry inline geometry (no file); everything else loads
    // its model file. Bail only when there's nothing to show either way.
    const isGenerated = asset.source === 'generated' && !!asset.geometry;
    if (!canvas || (!isGenerated && !asset.modelFile)) return;
    setStatus('loading');
    setError('');
    setGroups([]);

    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.04, 0.04, 0.07, 1);
    const camera = new ArcRotateCamera('cam', Math.PI / 4, Math.PI / 3, 6, Vector3.Zero(), scene);
    camera.wheelDeltaPercentage = 0.02;
    camera.attachControl(canvas, true);
    const light = new HemisphericLight('light', new Vector3(0.4, 1, 0.3), scene);
    light.intensity = 1.1;
    light.groundColor = new Color3(0.3, 0.3, 0.4);
    sceneRef.current = scene;
    cameraRef.current = camera;

    engine.runRenderLoop(() => scene.render());
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(() => engine.resize());
    ro.observe(canvas);

    let disposed = false;
    const onReady = (meshes: AbstractMesh[], animationGroups: AnimationGroup[]) => {
      if (disposed) return;
      const root = new TransformNode('asset-root', scene);
      meshes.filter((m) => !m.parent).forEach((m) => (m.parent = root));
      meshesRef.current = meshes;
      rootRef.current = root;
      boundsRef.current = scene.getWorldExtends((m) => m.isVisible !== false); // raw, pre-transform
      groupsRef.current = animationGroups;
      animationGroups.forEach((g) => g.stop());
      setGroups(animationGroups.map((g) => g.name));
      setStatus('ready');
    };

    if (isGenerated) {
      // Build straight from the inline baked geometry — no file/loader involved. Preview with a
      // lit, double-sided StandardMaterial showing the base-colour (+ normal) texture: PBR here
      // would need IBL to not render near-black, and kernel geometry isn't single-sided-clean.
      const mesh = buildCustomMesh(scene, `gen-${asset.id}`, asset.geometry!);
      const mat = new StandardMaterial('gen-mat', scene);
      const m = asset.meshMaterial;
      if (m?.baseColorMap) mat.diffuseTexture = new Texture(m.baseColorMap, scene);
      else mat.diffuseColor = hexToColor3(asset.meshColor ?? '#cccccc');
      if (m?.normalMap) mat.bumpTexture = new Texture(m.normalMap, scene);
      mat.specularColor = new Color3(0.1, 0.1, 0.1);
      mat.backFaceCulling = false;
      mat.twoSidedLighting = true; // light both sides correctly (kernel winding isn't uniform)
      mesh.material = mat;
      onReady([mesh], []);
    } else {
      SceneLoader.ImportMeshAsync(null, asset.rootUrl ?? ASSET_ROOT, asset.modelFile!, scene)
        .then((result) => onReady(result.meshes, result.animationGroups))
        .catch((err: unknown) => {
          if (disposed) return;
          setError(err instanceof Error ? err.message : String(err));
          setStatus('error');
        });
    }

    return () => {
      disposed = true;
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
      sceneRef.current = cameraRef.current = rootRef.current = null;
      boundsRef.current = null;
      meshesRef.current = [];
    };
  }, [asset.id, asset.modelFile]);

  // ----- Live transform + tint — re-applies without reloading the model. -----
  useEffect(() => {
    const root = rootRef.current;
    const bounds = boundsRef.current;
    if (status !== 'ready' || !root || !bounds) return;
    const r = computeModelTransform(transform, bounds);
    root.position.set(r.position.x, r.position.y, r.position.z);
    root.rotation.set(r.rotationDeg.x * DEG, r.rotationDeg.y * DEG, r.rotationDeg.z * DEG);
    root.scaling.set(r.scaling.x, r.scaling.y, r.scaling.z);
    const c = colorHex ? hexToColor3(colorHex) : null;
    for (const m of meshesRef.current) {
      const mat = m.material as { diffuseColor?: Color3; albedoColor?: Color3; backFaceCulling?: boolean } | null;
      if (mat && c && 'diffuseColor' in mat) mat.diffuseColor = c;
      if (mat && c && 'albedoColor' in mat) mat.albedoColor = c;
      if (mat && doubleSided !== undefined) mat.backFaceCulling = !doubleSided;
    }
    if (sceneRef.current && cameraRef.current) frameCamera(sceneRef.current, cameraRef.current);
  }, [status, transformKey, colorHex, doubleSided]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlay = () => {
    const gs = groupsRef.current;
    if (!gs.length) return;
    if (playing) {
      gs.forEach((g) => g.pause());
      setPlaying(false);
    } else {
      gs.forEach((g) => g.play(true));
      setPlaying(true);
    }
  };

  return (
    <div className="model-preview">
      <canvas ref={canvasRef} className="model-canvas" />
      {status === 'loading' && <div className="model-overlay"><Loader2 className="spin" size={20} /> Loading…</div>}
      {status === 'error' && <div className="model-overlay error"><AlertTriangle size={18} /> {error || 'Failed to load model'}</div>}
      {status === 'ready' && (
        <div className="model-controls">
          {groups.length > 0 ? (
            <button className="model-play" onClick={togglePlay} title={playing ? 'Pause' : 'Play animation'}>
              {playing ? <Pause size={14} /> : <Play size={14} />}
              {groups.length === 1 ? groups[0] : `${groups.length} animations`}
            </button>
          ) : (
            <span className="model-noanim">No animations · {asset.format.toUpperCase()} is a static format</span>
          )}
        </div>
      )}
    </div>
  );
}

/** Point the orbit camera at the scene's contents and pull back to fit them. */
function frameCamera(scene: Scene, camera: ArcRotateCamera) {
  const { min, max } = scene.getWorldExtends((m) => m.isVisible !== false);
  const center = min.add(max).scale(0.5);
  const size = max.subtract(min).length() || 2;
  camera.setTarget(center);
  camera.radius = size * 1.4;
  camera.lowerRadiusLimit = size * 0.3;
  camera.upperRadiusLimit = size * 6;
}
