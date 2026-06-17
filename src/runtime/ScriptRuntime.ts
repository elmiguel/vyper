import type { Observer } from '@babylonjs/core/Misc/observable';
import type { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { IPhysicsCollisionEvent } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import type { SceneManager } from '@/babylon/SceneManager';
import { type Entity, type Objective, type Script, isMeshCollidable } from '@/types';
import { gameConsole } from '@/store/consoleStore';
import { generateCode } from '@/nodes/codegen';
import { flowTracker } from '@/runtime/flowTracker';
import { V, vec } from './vector';
import { InputState } from './InputState';
import { makeCameraApi } from './cameraApi';
import { makeEntityApi } from './entityApi';
import { ObjectiveTracker, type ObjectiveState } from './ObjectiveTracker';
import { VolumeEnforcer } from './VolumeEnforcer';

export type { ObjectiveState } from './ObjectiveTracker';

type LifecycleFn = ((dt: number) => void) | null;
type CollisionFn = ((other: string) => void) | null;

interface Instance {
  entityId: string;
  entityName: string;
  scriptName: string;
  onStart: LifecycleFn;
  onUpdate: LifecycleFn;
  onCollision: CollisionFn;
  /** Trigger-volume hooks — fired by the TriggerTracker with the entering object's name. */
  onTriggerEnter: CollisionFn;
  onTriggerExit: CollisionFn;
  onTriggerStay: CollisionFn;
  errored: boolean;
  /** Disposer for the physics collision observable, if onCollision is wired. */
  unwireCollision?: () => void;
}

export class ScriptRuntime {
  private instances: Instance[] = [];
  private input: InputState;
  private time = { elapsed: 0, delta: 0 };
  private observer: Observer<Scene> | null = null;
  private paused = false;
  private liveApis = new Map<string, ReturnType<typeof makeEntityApi>>();
  private objectives = new ObjectiveTracker([]);
  /** Per-frame volume boundary + preset enforcement (dead zone / fog / water / sound). */
  private volumeEnforcer: VolumeEnforcer | null = null;

  constructor(private sceneManager: SceneManager) {
    this.input = new InputState(sceneManager);
  }

  /** Compile + start all enabled scripts. Returns compile error count. */
  start(entities: Entity[], scripts: Record<string, Script>, objectives: Objective[] = []): number {
    this.stop();
    this.time = { elapsed: 0, delta: 0 };
    this.objectives = new ObjectiveTracker(objectives);
    this.input.start();
    flowTracker.begin();

    // Cross-entity access for Set/Get Property targets, On Collision's "other",
    // trigger events, and cross-entity world actions. An object reference is an
    // entity id (mesh names are entity ids); names also resolve, so
    // `findObject("Enemy")` works. Closures read liveApis/scene at call time.
    const sm = this.sceneManager;
    const byId = new Set(entities.map((e) => e.id));
    const byName = new Map<string, string>();
    const entityById = new Map(entities.map((e) => [e.id, e]));
    for (const e of entities) if (!byName.has(e.name)) byName.set(e.name, e.id);
    const resolveId = (target: unknown) => {
      const t = String(target ?? '');
      return byId.has(t) ? t : byName.get(t) ?? t;
    };
    const effectConfig = (id: string, name?: string) => {
      const fx = (entityById.get(id)?.effects ?? []);
      return (name ? fx.find((f) => f.name === name) : fx[0])?.config;
    };
    // One camera helper shared across all scripts (single game camera).
    const camera = makeCameraApi(sm.gameCamera, sm, resolveId);

    const world = {
      findObject: (name: unknown) => resolveId(name),
      setProp: (target: unknown, key: string, value: unknown) => {
        const a = this.liveApis.get(resolveId(target));
        if (a) a.props[key] = value as never;
      },
      getProp: (target: unknown, key: string) => {
        const a = this.liveApis.get(resolveId(target));
        return a ? a.props[key] ?? 0 : 0;
      },
      // ----- Cross-entity object control (affect ANY object, not just scripted) -----
      getPosition: (target: unknown) => {
        const m = sm.getMesh(resolveId(target));
        return m ? new V(m.position.x, m.position.y, m.position.z) : new V();
      },
      teleport: (target: unknown, x: number, y = 0, z = 0) => {
        sm.getMesh(resolveId(target))?.position.set(x, y, z);
      },
      move: (target: unknown, dx: number, dy = 0, dz = 0) => {
        sm.getMesh(resolveId(target))?.position.addInPlaceFromFloats(dx, dy, dz);
      },
      setVisible: (target: unknown, visible: unknown) => sm.setEntityVisible(resolveId(target), !!visible),
      setActive: (target: unknown, active: unknown) => sm.setEntityActive(resolveId(target), !!active),
      destroy: (target: unknown) => sm.destroyRuntimeEntity(resolveId(target)),
      // ----- Cross-entity physics -----
      setVelocity: (target: unknown, x: number, y = 0, z = 0) => {
        sm.getBody(resolveId(target))?.setLinearVelocity(new Vector3(x, y, z));
      },
      applyImpulse: (target: unknown, x: number, y = 0, z = 0) => {
        const id = resolveId(target);
        const m = sm.getMesh(id);
        sm.getBody(id)?.applyImpulse(new Vector3(x, y, z), m ? m.getAbsolutePosition() : Vector3.ZeroReadOnly);
      },
      // ----- Cross-entity effects -----
      playEffect: (target: unknown, name?: string) => {
        const id = resolveId(target);
        const cfg = effectConfig(id, name);
        if (cfg) sm.playEffect(id, cfg);
      },
      stopEffect: (target: unknown) => sm.stopEffect(resolveId(target)),
      // ----- Objectives (game goals, defined in the Design editor) -----
      completeObjective: (id: unknown) => this.objectives.completeObjective(id),
      addProgress: (id: unknown, n: unknown) => this.objectives.addProgress(id, n),
      isComplete: (id: unknown) => this.objectives.isComplete(id),
      progress: (id: unknown) => this.objectives.progress(id),
    };
    let errors = 0;

    for (const entity of entities) {
      for (const scriptId of entity.scriptIds) {
        const script = scripts[scriptId];
        if (!script || !script.enabled) continue;
        const mesh = this.sceneManager.getMesh(entity.id);
        const api = makeEntityApi(entity, mesh, this.sceneManager);
        this.liveApis.set(entity.id, api);

        const inst: Instance = {
          entityId: entity.id,
          entityName: entity.name,
          scriptName: script.name,
          onStart: null,
          onUpdate: null,
          onCollision: null,
          onTriggerEnter: null,
          onTriggerExit: null,
          onTriggerStay: null,
          errored: false,
        };

        try {
          // Node-mode scripts run an instrumented build so the editor can light
          // up the live execution path; hand-edited code runs verbatim.
          const traceable = script.mode === 'nodes' && !script.codeDirty && !!script.graph;
          const code = traceable ? generateCode(script.graph, { trace: true }) : script.code;
          // eslint-disable-next-line no-new-func
          const factory = new Function(
            'entity',
            'scene',
            'input',
            'time',
            'vec',
            'camera',
            'world',
            'console',
            '__node',
            `${code}\n; return {` +
              ` onStart: typeof onStart !== 'undefined' ? onStart : null,` +
              ` onUpdate: typeof onUpdate !== 'undefined' ? onUpdate : null,` +
              ` onCollision: typeof onCollision !== 'undefined' ? onCollision : null,` +
              ` onTriggerEnter: typeof onTriggerEnter !== 'undefined' ? onTriggerEnter : null,` +
              ` onTriggerExit: typeof onTriggerExit !== 'undefined' ? onTriggerExit : null,` +
              ` onTriggerStay: typeof onTriggerStay !== 'undefined' ? onTriggerStay : null };`,
          );
          const scoped = {
            log: (...a: unknown[]) => gameConsole.log(script.name, ...a),
            info: (...a: unknown[]) => gameConsole.info(script.name, ...a),
            warn: (...a: unknown[]) => gameConsole.warn(script.name, ...a),
            error: (...a: unknown[]) => gameConsole.error(script.name, ...a),
            debug: (...a: unknown[]) => gameConsole.debug(script.name, ...a),
          };
          const onNode = traceable ? (id: string) => flowTracker.hit(id) : () => {};
          const lifecycle = factory(api, this.sceneManager.scene, this.input, this.time, vec, camera, world, scoped, onNode);
          inst.onStart = lifecycle.onStart;
          inst.onUpdate = lifecycle.onUpdate;
          inst.onCollision = lifecycle.onCollision;
          inst.onTriggerEnter = lifecycle.onTriggerEnter;
          inst.onTriggerExit = lifecycle.onTriggerExit;
          inst.onTriggerStay = lifecycle.onTriggerStay;
        } catch (err) {
          errors++;
          gameConsole.error(script.name, `Compile error: ${(err as Error).message}`);
          inst.errored = true;
        }

        this.instances.push(inst);
      }
    }

    // Run onStart (controllers create their physics bodies here).
    for (const inst of this.instances) this.safeCall(inst, inst.onStart, 0);

    // Wire collision callbacks now that bodies exist.
    for (const inst of this.instances) {
      if (!inst.onCollision || inst.errored) continue;
      const body = this.sceneManager.getBody(inst.entityId);
      if (!body) continue;
      body.setCollisionCallbackEnabled(true);
      const obs = body.getCollisionObservable();
      const observer = obs.add((ev: IPhysicsCollisionEvent) => {
        const other = ev.collidedAgainst?.transformNode?.name ?? '';
        this.safeCall(inst, () => inst.onCollision?.(other), 0);
      });
      inst.unwireCollision = () => obs.remove(observer);
    }

    // ----- Trigger volumes: per-frame geometric-overlap detection -----
    // A volume is an entity with trigger.enabled + a mesh; it fires the trigger
    // hooks of its own script instances when other meshes enter/stay/exit it.
    const nameById = new Map(entities.map((e) => [e.id, e.name] as const));
    const tagById = new Map(entities.map((e) => [e.id, e.tag] as const));
    // Candidate objects a volume can detect: any collidable mesh entity that isn't
    // itself a volume. Collidable (not necessarily visible) — a hidden object with
    // collision on still trips triggers; one with collision off is ignored.
    const candidates = entities
      .filter((e) => e.mesh && isMeshCollidable(e.mesh) && !e.trigger?.enabled)
      .map((e) => e.id);
    const volumes = entities
      .filter((e) => e.trigger?.enabled && sm.getMesh(e.id))
      .map((e) => ({
        id: e.id,
        cfg: e.trigger!,
        mesh: sm.getMesh(e.id)!,
        inside: new Set<string>(),
        fired: false,
        insts: this.instances.filter(
          (i) => i.entityId === e.id && (i.onTriggerEnter || i.onTriggerExit || i.onTriggerStay),
        ),
      }))
      .filter((v) => v.insts.length > 0);

    const tickTriggers = () => {
      for (const vol of volumes) {
        if (vol.cfg.once && vol.fired) continue;
        const now = new Set<string>();
        for (const cid of candidates) {
          if (cid === vol.id) continue;
          if (vol.cfg.filter.length) {
            const nm = nameById.get(cid);
            const tg = tagById.get(cid);
            if (!(nm && vol.cfg.filter.includes(nm)) && !(tg && vol.cfg.filter.includes(tg))) continue;
          }
          const cm = sm.getMesh(cid);
          if (!cm || !cm.isEnabled()) continue;
          if (vol.mesh.intersectsMesh(cm, false)) now.add(cid);
        }
        for (const cid of now) {
          const other = nameById.get(cid) ?? cid;
          if (!vol.inside.has(cid)) {
            for (const inst of vol.insts) this.safeCall(inst, () => inst.onTriggerEnter?.(other), 0);
            if (vol.cfg.once) vol.fired = true;
          } else {
            for (const inst of vol.insts) this.safeCall(inst, () => inst.onTriggerStay?.(other), 0);
          }
        }
        for (const cid of vol.inside) {
          if (!now.has(cid)) {
            const other = nameById.get(cid) ?? cid;
            for (const inst of vol.insts) this.safeCall(inst, () => inst.onTriggerExit?.(other), 0);
          }
        }
        vol.inside = now;
      }
    };

    // Volume boundaries + presets (dead zone / fog / water / sound), enforced each
    // frame after scripts move things and triggers are detected.
    this.volumeEnforcer = new VolumeEnforcer(this.sceneManager);
    this.volumeEnforcer.build(entities);

    // Drive onUpdate from the render loop.
    this.observer = this.sceneManager.scene.onBeforeRenderObservable.add(() => {
      if (this.paused) return;
      const dt = Math.min(this.sceneManager.engine.getDeltaTime() / 1000, 0.1);
      this.time.delta = dt;
      this.time.elapsed += dt;
      for (const inst of this.instances) this.safeCall(inst, inst.onUpdate, dt);
      tickTriggers();
      this.volumeEnforcer?.tick(dt);
      camera.update(dt);
      // Announce a win once all primary objectives are complete.
      this.objectives.checkWin();
      // Clear per-frame mouse delta after all scripts have read it this frame.
      this.input.endFrame();
    });

    return errors;
  }

  private safeCall(inst: Instance, fn: LifecycleFn, dt: number) {
    if (!fn || inst.errored) return;
    try {
      fn(dt);
    } catch (err) {
      inst.errored = true; // stop after first runtime error to avoid 60fps spam
      const message = (err as Error).message;
      // Pin the break to the last node that executed before the throw.
      flowTracker.fail(message, inst.scriptName);
      gameConsole.error(inst.scriptName, `Runtime error (disabled): ${message}`);
    }
  }

  setPaused(p: boolean) {
    this.paused = p;
  }

  /** Live transform for the inspector to display while playing. */
  liveTransform(entityId: string) {
    const api = this.liveApis.get(entityId);
    if (!api) return null;
    return { position: { ...api.position }, rotation: { ...api.rotation }, props: api.props };
  }

  /** Live objective progress for the design HUD / readout while playing. */
  liveObjectives(): ObjectiveState[] {
    return this.objectives.states();
  }

  stop() {
    if (this.observer) {
      this.sceneManager.scene.onBeforeRenderObservable.remove(this.observer);
      this.observer = null;
    }
    for (const inst of this.instances) inst.unwireCollision?.();
    this.volumeEnforcer?.dispose();
    this.volumeEnforcer = null;
    this.input.stop();
    this.instances = [];
    this.liveApis.clear();
    this.paused = false;
    flowTracker.end();
  }
}
