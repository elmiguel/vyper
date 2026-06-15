import { Vector3 } from '@babylonjs/core/Maths/math';
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
import type { Entity, GameMode } from '@/types';

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
    this.physicsActive = true;
    for (const e of entities) {
      if (e.physics?.enabled && e.mesh) {
        this.ensureBody(e.id, e.physics);
      } else if (e.mesh && (e.mesh.kind === 'ground' || e.mesh.kind === 'plane')) {
        // Floors get a static collider automatically so character controllers
        // (which create their own dynamic body at runtime) have something to
        // stand on without the user wiring up physics by hand.
        this.ensureBody(e.id, { type: 'static', shape: 'box' });
      }
    }
  }

  /** Dispose all bodies and turn physics off. Call on Stop. */
  disablePhysics(): void {
    for (const agg of this.aggregates.values()) agg.dispose();
    this.aggregates.clear();
    if (this.ctx.scene.getPhysicsEngine()) this.ctx.scene.disablePhysicsEngine();
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
    if (existing) return existing.body;
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
    if (type === 'character') {
      // Zero rotational inertia + heavy angular damping keeps the capsule upright.
      agg.body.setMassProperties({ inertia: new Vector3(0, 0, 0) });
      agg.body.setAngularDamping(100);
    }
    this.aggregates.set(entityId, agg);
    return agg.body;
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
