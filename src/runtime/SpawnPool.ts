/**
 * The two-pool spawn queue for the Spawner feature.
 *
 * Each spawner owns a pool of instances of its target object that move between two states:
 *  - **spawner pool** (`idle`): inactive instances parked off-world, ready to deploy;
 *  - **game pool** (`live`): instances currently active at play in the world.
 *
 * `spawn` hands one instance from the spawner pool to the game pool (creating a fresh clone when
 * the spawner pool is empty, so it grows on demand — counts are unbounded). `despawn` hands it
 * back the other way for reuse. This keeps allocation churn down for things like AI agents that
 * spawn and die repeatedly.
 *
 * The class is pure bookkeeping: all Babylon work (cloning meshes, enabling/placing/disposing) is
 * injected via {@link SpawnPoolCtx}, so it unit-tests with a fake context and the runtime wires
 * the real scene ops in. Instances live only at runtime — never in the store — so Stop discards
 * them and the scene resets to its authored state.
 */

/** A spawner to register at play start: its id, the object it deploys, and optional pre-warm count. */
export interface SpawnerReg {
  spawnerId: string;
  targetId: string;
  /** Instances to pre-create in the spawner pool (0 = grow lazily on first spawn). */
  prewarm?: number;
}

/** Babylon-side glue the pool needs. Injected to keep the pool logic pure/testable. */
export interface SpawnPoolCtx {
  /** Clone `targetId`'s source mesh into a runtime instance named `instanceId`. Returns false if
   *  the source mesh doesn't exist (nothing to clone) — the caller then skips that instance. */
  createInstance: (targetId: string, instanceId: string) => boolean;
  /** Enable (game pool) or disable (spawner pool) a runtime instance. */
  setInstanceActive: (instanceId: string, active: boolean) => void;
  /** Move an instance onto the spawner's current world position (the spawn point). */
  placeAtSpawner: (instanceId: string, spawnerId: string) => void;
  /** Hide the source object at play start — it becomes the pool's template, not a live object. */
  hideSource: (targetId: string) => void;
  /** Dispose an instance's runtime presence (mesh/body). Called on reset/Stop. */
  disposeInstance: (instanceId: string) => void;
}

interface Pool {
  spawnerId: string;
  targetId: string;
  idle: string[]; // spawner pool — inactive, reusable
  live: Set<string>; // game pool — active in the world
  created: number; // total instances minted (drives unique instance ids)
}

export class SpawnPool {
  private pools = new Map<string, Pool>();
  /** instance id → owning spawner id, so `despawn` can find an instance's pool. */
  private owner = new Map<string, string>();

  constructor(private ctx: SpawnPoolCtx) {}

  /** Register spawners at play start: hide each source object and pre-warm its pool. Replaces any
   *  prior registration (call {@link reset} first on Stop). */
  register(spawners: SpawnerReg[]): void {
    for (const { spawnerId, targetId, prewarm = 0 } of spawners) {
      if (!targetId) continue;
      const pool: Pool = { spawnerId, targetId, idle: [], live: new Set(), created: 0 };
      this.pools.set(spawnerId, pool);
      this.ctx.hideSource(targetId);
      for (let i = 0; i < prewarm; i++) {
        const id = this.mint(pool);
        if (id) {
          this.ctx.setInstanceActive(id, false);
          pool.idle.push(id);
        }
      }
    }
  }

  /** Deploy one instance at the spawner: reuse an idle one, else grow the pool. Returns the
   *  instance id (a runtime entity id usable with world ops / despawn), or null if the spawner
   *  is unknown or its source can't be cloned. */
  spawn(spawnerId: string): string | null {
    const pool = this.pools.get(spawnerId);
    if (!pool) return null;
    const id = pool.idle.pop() ?? this.mint(pool);
    if (!id) return null;
    this.ctx.placeAtSpawner(id, spawnerId);
    this.ctx.setInstanceActive(id, true);
    pool.live.add(id);
    return id;
  }

  /** Return a live instance to its spawner pool for reuse. Returns false if `instanceId` isn't a
   *  currently-live instance of any spawner. */
  despawn(instanceId: string): boolean {
    const spawnerId = this.owner.get(instanceId);
    const pool = spawnerId ? this.pools.get(spawnerId) : undefined;
    if (!pool || !pool.live.has(instanceId)) return false;
    pool.live.delete(instanceId);
    this.ctx.setInstanceActive(instanceId, false);
    pool.idle.push(instanceId);
    return true;
  }

  /** Whether `instanceId` is a spawned instance (live or idle) — e.g. so a despawn action can
   *  ignore non-instance targets. */
  isInstance(instanceId: string): boolean {
    return this.owner.has(instanceId);
  }

  /** Tear down every instance (mesh + bookkeeping). Call on Stop. */
  reset(): void {
    for (const id of this.owner.keys()) this.ctx.disposeInstance(id);
    this.pools.clear();
    this.owner.clear();
  }

  /** Active (game-pool) instance count for a spawner — for tests / debug HUD. */
  liveCount(spawnerId: string): number {
    return this.pools.get(spawnerId)?.live.size ?? 0;
  }

  /** Idle (spawner-pool) instance count for a spawner — for tests / debug HUD. */
  idleCount(spawnerId: string): number {
    return this.pools.get(spawnerId)?.idle.length ?? 0;
  }

  /** Create a brand-new instance for a pool, or null if its source mesh can't be cloned. */
  private mint(pool: Pool): string | null {
    const id = `${pool.spawnerId}#${pool.created}`;
    if (!this.ctx.createInstance(pool.targetId, id)) return null;
    pool.created++;
    this.owner.set(id, pool.spawnerId);
    return id;
  }
}
