import { describe, it, expect, beforeEach } from 'vitest';
import { SpawnPool, type SpawnPoolCtx } from './SpawnPool';

/** A fake scene: tracks instance meshes, their active state, placement, and the hidden sources —
 *  enough to assert the pool's two-pool handoff without Babylon. */
function fakeCtx() {
  const meshes = new Set<string>(); // existing source meshes (targets that can be cloned)
  const active = new Map<string, boolean>(); // instance id → active
  const placedAt = new Map<string, string>(); // instance id → spawner id
  const hidden: string[] = []; // sources hidden into the pool, in order
  const disposed: string[] = [];

  const ctx: SpawnPoolCtx = {
    createInstance: (targetId, instanceId) => {
      if (!meshes.has(targetId)) return false;
      active.set(instanceId, false);
      return true;
    },
    setInstanceActive: (instanceId, on) => active.set(instanceId, on),
    placeAtSpawner: (instanceId, spawnerId) => placedAt.set(instanceId, spawnerId),
    hideSource: (targetId) => hidden.push(targetId),
    disposeInstance: (instanceId) => {
      disposed.push(instanceId);
      active.delete(instanceId);
    },
  };
  return { ctx, meshes, active, placedAt, hidden, disposed };
}

describe('SpawnPool', () => {
  let f: ReturnType<typeof fakeCtx>;
  let pool: SpawnPool;
  beforeEach(() => {
    f = fakeCtx();
    f.meshes.add('enemy'); // the target object's source mesh exists
    pool = new SpawnPool(f.ctx);
  });

  it('hides the source at register and spawns active instances at the spawner', () => {
    pool.register([{ spawnerId: 'sp', targetId: 'enemy' }]);
    expect(f.hidden).toEqual(['enemy']);

    const a = pool.spawn('sp');
    expect(a).toBe('sp#0');
    expect(f.active.get(a!)).toBe(true);
    expect(f.placedAt.get(a!)).toBe('sp');
    expect(pool.liveCount('sp')).toBe(1);
  });

  it('grows the pool when no idle instance is available (unbounded count)', () => {
    pool.register([{ spawnerId: 'sp', targetId: 'enemy' }]);
    const ids = [pool.spawn('sp'), pool.spawn('sp'), pool.spawn('sp')];
    expect(ids).toEqual(['sp#0', 'sp#1', 'sp#2']);
    expect(pool.liveCount('sp')).toBe(3);
    expect(pool.idleCount('sp')).toBe(0);
  });

  it('despawn returns an instance to the spawner pool and spawn reuses it', () => {
    pool.register([{ spawnerId: 'sp', targetId: 'enemy' }]);
    const a = pool.spawn('sp')!;
    expect(pool.despawn(a)).toBe(true);
    expect(f.active.get(a)).toBe(false);
    expect(pool.liveCount('sp')).toBe(0);
    expect(pool.idleCount('sp')).toBe(1);

    const b = pool.spawn('sp');
    expect(b).toBe(a); // reused, not a new clone
    expect(pool.idleCount('sp')).toBe(0);
    expect(pool.liveCount('sp')).toBe(1);
  });

  it('pre-warms idle instances without making them live', () => {
    pool.register([{ spawnerId: 'sp', targetId: 'enemy', prewarm: 2 }]);
    expect(pool.idleCount('sp')).toBe(2);
    expect(pool.liveCount('sp')).toBe(0);
    pool.spawn('sp');
    expect(pool.idleCount('sp')).toBe(1); // drew from the warm pool, didn't grow
  });

  it('despawn ignores non-instances and unknown spawners are inert', () => {
    pool.register([{ spawnerId: 'sp', targetId: 'enemy' }]);
    expect(pool.despawn('player')).toBe(false);
    expect(pool.isInstance('player')).toBe(false);
    expect(pool.spawn('nope')).toBeNull();
  });

  it('returns null and does not register when the source mesh is missing', () => {
    pool.register([{ spawnerId: 'sp2', targetId: 'ghost' }]); // 'ghost' has no source mesh
    expect(pool.spawn('sp2')).toBeNull();
  });

  it('reset disposes every instance and clears the pools', () => {
    pool.register([{ spawnerId: 'sp', targetId: 'enemy' }]);
    const a = pool.spawn('sp')!;
    pool.despawn(a);
    const b = pool.spawn('sp')!; // a reused → still one instance; add one more
    pool.spawn('sp');
    pool.reset();
    expect(f.disposed.sort()).toEqual(['sp#0', 'sp#1']);
    expect(pool.liveCount('sp')).toBe(0);
    expect(pool.isInstance(b)).toBe(false);
    expect(pool.spawn('sp')).toBeNull(); // pool gone after reset
  });
});
