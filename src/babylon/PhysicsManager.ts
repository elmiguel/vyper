import { Vector3, Quaternion } from '@babylonjs/core/Maths/math';
import HavokPhysics from '@babylonjs/havok';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType, PhysicsMotionType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { PhysicsRaycastResult } from '@babylonjs/core/Physics/physicsRaycastResult';
import type { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
// Side-effect: augments Scene with enablePhysics/getPhysicsEngine/disablePhysics.
import '@babylonjs/core/Physics/v2/physicsEngineComponent';
import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { type Entity, type GameMode, type PhysicsConfig, isMeshCollidable } from '@/types';

/** Options accepted by {@link PhysicsManager.ensureBody}. */
export interface BodyOpts {
  type?: 'dynamic' | 'static' | 'kinematic' | 'character';
  shape?: string;
  mass?: number;
  restitution?: number;
  friction?: number;
}

/** Mesh kinds that are world surfaces you stand on. These are ALWAYS static
 *  colliders: a dynamic floor falls under gravity, and a jump's contact reaction
 *  shoves it down — which makes the player appear to launch "up and up" as the
 *  floor races away. So a dynamic/kinematic type configured on a floor is coerced
 *  to static here. */
const FLOOR_KINDS = new Set(['ground', 'plane', 'terrain']);

/**
 * Resolve the collider options for an entity, or null for "no body". Pure +
 * unit-testable. Floors are forced static (see {@link FLOOR_KINDS}); other meshes
 * use their configured physics; meshes with no physics still get an automatic
 * static collider when they're a floor kind, so players have something to stand on.
 */
export function physicsBodyOptsFor(meshKind: string | undefined, physics?: PhysicsConfig): BodyOpts | null {
  const isFloor = !!meshKind && FLOOR_KINDS.has(meshKind);
  if (physics?.enabled) {
    return isFloor ? { ...physics, type: 'static' } : physics;
  }
  if (meshKind === 'ground' || meshKind === 'plane') return { type: 'static', shape: 'box' };
  if (meshKind === 'terrain') return { type: 'static', shape: 'mesh' };
  return null;
}

/** Accessors PhysicsManager needs from its owning SceneManager. */
export interface PhysicsContext {
  scene: Scene;
  mode: GameMode;
  getMesh(id: string): AbstractMesh | undefined;
  getMeshKind(id: string): string | undefined;
}

/** Owns the Havok plugin, the per-entity physics bodies, and runtime raycasts. */
export class PhysicsManager {
  private havok: HavokPlugin | null = null;
  private havokPromise: Promise<HavokPlugin> | null = null;
  private aggregates = new Map<string, PhysicsAggregate>();
  /** True between enablePhysics() and disablePhysics() (i.e. during Play). */
  physicsActive = false;
  private rayResult = new PhysicsRaycastResult();
  /** The engine timestep saved when frozen by Pause, restored on resume. */
  private savedTimeStep: number | null = null;
  /** Default Havok step (seconds). Restored on Play and resume-from-pause. */
  private static readonly DEFAULT_TIMESTEP = 1 / 60;

  constructor(private ctx: PhysicsContext) {}

  /** Load + cache the Havok WASM plugin once. Safe to call repeatedly. */
  async loadHavok(): Promise<HavokPlugin> {
    if (this.havok) return this.havok;
    if (!this.havokPromise) {
      // The .wasm is served from /public (see vite copy) so the bundler doesn't
      // have to resolve it from inside the (excluded) Havok glue module.
      this.havokPromise = HavokPhysics({ locateFile: () => '/HavokPhysics.wasm' }).then(
        (hk) => new HavokPlugin(true, hk),
      );
    }
    this.havok = await this.havokPromise;
    return this.havok;
  }

  /** Enable physics on the scene and build bodies for entities that opt in. Call on Play. */
  async enablePhysics(entities: Entity[]): Promise<void> {
    if (this.ctx.mode === '2d') return; // player controllers / dynamics are 3D-only for now
    const plugin = await this.loadHavok();
    if (!this.ctx.scene.getPhysicsEngine()) {
      this.ctx.scene.enablePhysics(new Vector3(0, -9.81, 0), plugin);
    }
    // The engine persists across Stop/Play (see disablePhysics), so normalize the
    // timestep here — a previous Pause may have frozen it at 0, which would leave
    // the simulation silently stopped on the next Play.
    this.savedTimeStep = null;
    this.ctx.scene.getPhysicsEngine()?.setTimeStep(PhysicsManager.DEFAULT_TIMESTEP);
    this.physicsActive = true;
    for (const e of entities) {
      // A mesh with collision toggled off gets no collider (visible or not).
      if (!e.mesh || !isMeshCollidable(e.mesh)) continue;
      const opts = physicsBodyOptsFor(e.mesh.kind, e.physics);
      if (opts) this.ensureBody(e.id, opts);
    }
  }

  /**
   * Freeze/unfreeze the simulation for Pause by zeroing the engine timestep.
   * On unfreeze, snap every body to its mesh so objects nudged while paused stay
   * put (bodies don't track mesh moves by default — disablePreStep is on).
   */
  setPaused(paused: boolean): void {
    const engine = this.ctx.scene.getPhysicsEngine();
    if (!engine) return;
    if (paused) {
      if (this.savedTimeStep === null) this.savedTimeStep = engine.getTimeStep();
      engine.setTimeStep(0);
    } else {
      engine.setTimeStep(this.savedTimeStep ?? PhysicsManager.DEFAULT_TIMESTEP);
      this.savedTimeStep = null;
      for (const [id, agg] of this.aggregates) {
        const mesh = this.ctx.getMesh(id);
        if (!mesh) continue;
        const rot = mesh.rotationQuaternion ?? Quaternion.FromEulerVector(mesh.rotation);
        agg.body.setTargetTransform(mesh.absolutePosition, rot);
      }
    }
  }

  /**
   * Dispose all bodies and turn physics off. Call on Stop.
   *
   * The Havok engine and its plugin are intentionally LEFT ALIVE.
   * `scene.disablePhysicsEngine()` would dispose the plugin's WASM world, and the
   * cached HavokPlugin can't be reused — so the next Play would call
   * `scene.enablePhysics` with a dead plugin and every body would throw
   * "No Physics Engine available." With all bodies removed the idle engine
   * simulates nothing; it's torn down for real when the scene is disposed.
   */
  disablePhysics(): void {
    this.savedTimeStep = null;
    for (const agg of this.aggregates.values()) agg.dispose();
    this.aggregates.clear();
    this.physicsActive = false;
  }

  private shapeTypeFor(entityId: string, hint?: string): number {
    const kind = hint && hint !== 'auto' ? hint : this.ctx.getMeshKind(entityId);
    switch (kind) {
      case 'sphere':
      case 'circle':
        return PhysicsShapeType.SPHERE;
      case 'capsule':
        return PhysicsShapeType.CAPSULE;
      case 'cylinder':
      case 'cone':
        return PhysicsShapeType.CYLINDER;
      case 'mesh':
      case 'terrain':
        return PhysicsShapeType.MESH;
      default:
        return PhysicsShapeType.BOX;
    }
  }

  /**
   * Create (or fetch) a physics body for an entity. Used both for Inspector-configured
   * bodies and for runtime `entity.usePhysics(...)` from controller scripts.
   * `type: 'character'` makes an upright, non-tipping dynamic capsule for player controllers.
   */
  ensureBody(
    entityId: string,
    opts: {
      type?: 'dynamic' | 'static' | 'kinematic' | 'character';
      shape?: string;
      mass?: number;
      restitution?: number;
      friction?: number;
    } = {},
  ): PhysicsBody | null {
    const existing = this.aggregates.get(entityId);
    if (existing) {
      // A controller asking for 'character' upgrades whatever body is already
      // there (e.g. a rigid body the user added in the Inspector) to upright +
      // non-spinning — otherwise it keeps full rotational inertia and tumbles.
      if (opts.type === 'character') this.makeUprightCharacter(existing.body);
      return existing.body;
    }
    const mesh = this.ctx.getMesh(entityId);
    if (!mesh || !this.physicsActive) return null;

    const type = opts.type ?? 'dynamic';
    const shapeType =
      type === 'character' ? PhysicsShapeType.CAPSULE : this.shapeTypeFor(entityId, opts.shape);
    const mass = type === 'static' ? 0 : opts.mass ?? 1;
    const agg = new PhysicsAggregate(
      mesh,
      shapeType,
      { mass, restitution: opts.restitution ?? 0.1, friction: opts.friction ?? 0.6 },
      this.ctx.scene,
    );
    if (type === 'static') agg.body.setMotionType(PhysicsMotionType.STATIC);
    if (type === 'kinematic') agg.body.setMotionType(PhysicsMotionType.ANIMATED);
    if (type === 'character') this.makeUprightCharacter(agg.body);
    this.aggregates.set(entityId, agg);
    return agg.body;
  }

  /** Make a body behave as an upright character controller: dynamic motion with
   *  zero rotational inertia + heavy angular damping, so contacts/impulses move
   *  it but never tip or spin it. Idempotent — safe to re-apply to any body.
   *
   *  Crucially, the existing mass is preserved: setMassProperties replaces the
   *  whole mass-properties struct, so passing only `inertia` would reset mass to
   *  0 — making the body immovable (impulses, i.e. jumps, would do nothing). */
  private makeUprightCharacter(body: PhysicsBody): void {
    body.setMotionType(PhysicsMotionType.DYNAMIC);
    const mass = body.getMassProperties().mass;
    body.setMassProperties({ mass: mass && mass > 0 ? mass : 1, inertia: new Vector3(0, 0, 0) });
    body.setAngularDamping(100);
    // No linear damping: the controller drives horizontal velocity directly, and
    // any vertical damping makes the jump apex hang ("levitate"). Gravity alone
    // should shape the arc → a crisp, predictable jump.
    body.setLinearDamping(0);
    body.setAngularVelocity(new Vector3(0, 0, 0));
  }

  getBody(entityId: string): PhysicsBody | null {
    return this.aggregates.get(entityId)?.body ?? null;
  }

  /** Dispose an entity's body (used when an object is deactivated or destroyed at runtime). */
  disposeBody(entityId: string): void {
    const agg = this.aggregates.get(entityId);
    if (agg) {
      agg.dispose();
      this.aggregates.delete(entityId);
    }
  }

  /** Cast a ray and return the hit distance (Infinity if nothing hit). */
  physicsRaycastDistance(from: Vector3, to: Vector3): number {
    const engine = this.ctx.scene.getPhysicsEngine();
    if (!engine) return Infinity;
    (engine as unknown as { raycastToRef(a: Vector3, b: Vector3, r: PhysicsRaycastResult): void }).raycastToRef(
      from,
      to,
      this.rayResult,
    );
    return this.rayResult.hasHit ? this.rayResult.hitDistance : Infinity;
  }
}
