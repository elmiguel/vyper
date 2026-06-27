import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Color4 } from '@babylonjs/core/Maths/math';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Entity, GameMode } from '@/types';
import { PhysicsManager } from './PhysicsManager';
import { EffectsManager } from './EffectsManager';
import { ModelLoader } from './modelLoader';
import { RigPlayer } from './RigPlayer';
import { SpawnPool } from '../runtime/SpawnPool';
import { hardwareScalingLevelFor } from './viewResize';
import type { Tracked } from './sceneSync';
import { gameConsole } from '@/store/consoleStore';

/** The engine + scene + shared managers a SceneManager is built around. */
export interface SceneCore {
  master: HTMLCanvasElement;
  engine: Engine;
  scene: Scene;
  physics: PhysicsManager;
  effects: EffectsManager;
  models: ModelLoader;
  rigPlayer: RigPlayer;
}

/**
 * Build the multi-view engine, scene, and the dedicated subsystem managers
 * (physics, particle effects, model loader, rig player). Extracted from the
 * SceneManager constructor so that class stays focused on wiring + lifecycle.
 */
export function createSceneCore(
  mode: GameMode,
  getMesh: (id: string) => AbstractMesh | undefined,
  getMeshKind: (id: string) => Tracked['meshKind'] | undefined,
): SceneCore {
  // Multi-view: the engine renders to a hidden master WebGL canvas and copies into
  // each registered view; the visible editor canvas is registered by the caller. The
  // generous default size avoids a low-res first frame before per-view dprResize runs.
  const master = document.createElement('canvas');
  master.width = 2560;
  master.height = 1440;

  const engine = new Engine(master, true, { preserveDrawingBuffer: true, stencil: true });
  // Native-pixel-ratio rendering (capped 2×) via hardwareScalingLevel — multi-view
  // resize and the picking ray both divide by it, keeping resolution + clicks in sync.
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
  engine.setHardwareScalingLevel(hardwareScalingLevelFor(dpr));

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.05, 0.06, 0.09, 1);
  // Selection picks on pointer-DOWN only (see onPointerObservable), so skip Babylon's
  // default raycast on every pointer-move — a real saving while the cursor moves.
  scene.skipPointerMovePicking = true;

  const physics = new PhysicsManager({ scene, mode, getMesh, getMeshKind });
  const effects = new EffectsManager({ scene, getMesh });
  const models = new ModelLoader(scene);
  const rigPlayer = new RigPlayer(scene, getMesh);

  return { master, engine, scene, physics, effects, models, rigPlayer };
}

/**
 * Register every spawner with a target at Play start: hide each source object into its
 * pool and pre-warm as configured. Instances are runtime-only, so Stop discards them.
 * Warns when a spawner pools a player/scripted object (it vanishes until spawned).
 */
export function registerSpawners(spawnPool: SpawnPool, entities: Entity[]): void {
  const specs = entities.filter((e) => e.spawner?.targetId);
  // A spawner's target is pooled (hidden) at Play and only appears via spawn(). That silently
  // hid players when a Spawner was pointed at them — surface it so it's never a mystery.
  for (const e of specs) {
    const t = entities.find((x) => x.id === e.spawner!.targetId);
    const playerish = t && (t.tag === 'player' || t.scriptIds.length > 0);
    gameConsole[playerish ? 'warn' : 'info'](
      'spawner',
      `"${e.name}" pools "${t?.name ?? e.spawner!.targetId}" — it's hidden until spawned` +
        (playerish ? '. If this is your controlled object, remove the spawner or retarget it (it won\'t render or be hit by volumes).' : '.'),
    );
  }
  spawnPool.register(
    specs.map((e) => ({ spawnerId: e.id, targetId: e.spawner!.targetId!, prewarm: e.spawner!.prewarm })),
  );
}
