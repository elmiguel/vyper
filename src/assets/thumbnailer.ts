import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3, Color3 } from '@babylonjs/core/Maths/math';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import '@/babylon/loaders'; // register OBJ/glTF (idempotent)
import type { Asset } from '@/types';

const ASSET_ROOT = '/assets/';
/** Resolved data-URL per asset id (or a rejected promise on failure). */
const cache = new Map<string, Promise<string>>();
/** Serializes rendering so we never hold more than one WebGL context at a time. */
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

/** Render one frame of a model into an offscreen canvas and capture it as a PNG
 *  data URL. The engine/scene are fully disposed before returning. */
async function renderThumbnail(asset: Asset, size: number): Promise<string> {
  if (!asset.modelFile) throw new Error('asset has no model file');
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  try {
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0, 0, 0, 0); // transparent — the card bg shows through
    const camera = new ArcRotateCamera('cam', Math.PI / 4, Math.PI / 3, 6, Vector3.Zero(), scene);
    const light = new HemisphericLight('light', new Vector3(0.4, 1, 0.3), scene);
    light.intensity = 1.1;
    light.groundColor = new Color3(0.3, 0.3, 0.4);

    await SceneLoader.ImportMeshAsync(null, asset.rootUrl ?? ASSET_ROOT, asset.modelFile, scene);
    const { min, max } = scene.getWorldExtends((m) => m.isVisible !== false);
    camera.setTarget(min.add(max).scale(0.5));
    camera.radius = (max.subtract(min).length() || 2) * 1.35;

    await scene.whenReadyAsync(); // wait for geometry + textures
    scene.render();
    return canvas.toDataURL('image/png');
  } finally {
    engine.dispose();
  }
}

/** Get (and memoize) a model asset's preview thumbnail as a PNG data URL.
 *  Rejects if the model can't be loaded — callers should fall back to an icon. */
export function getThumbnail(asset: Asset, size = 256): Promise<string> {
  const hit = cache.get(asset.id);
  if (hit) return hit;
  const p = enqueue(() => renderThumbnail(asset, size));
  cache.set(asset.id, p);
  // Don't cache failures forever — let a later open retry.
  p.catch(() => cache.delete(asset.id));
  return p;
}
