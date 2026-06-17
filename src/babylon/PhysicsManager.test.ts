import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Havok's WASM can't load under jsdom, so stub the plugin + aggregate. These
// mocks let PhysicsManager exercise its engine-lifecycle logic without real physics.
vi.mock('@babylonjs/havok', () => ({ default: vi.fn(async () => ({})) }));
vi.mock('@babylonjs/core/Physics/v2/Plugins/havokPlugin', () => ({
  HavokPlugin: vi.fn(function HavokPlugin() {}),
}));
vi.mock('@babylonjs/core/Physics/v2/physicsAggregate', () => ({
  PhysicsAggregate: vi.fn(function (this: { body: unknown; dispose: () => void }) {
    this.body = {
      setMassProperties: vi.fn(),
      setAngularDamping: vi.fn(),
      setMotionType: vi.fn(),
    };
    this.dispose = vi.fn();
  }),
}));

import { PhysicsManager } from './PhysicsManager';

/** A fake scene that records physics-engine lifecycle calls. */
function makeScene() {
  let engine: { setTimeStep: ReturnType<typeof vi.fn>; getTimeStep: () => number } | null = null;
  let timeStep = 1 / 60;
  const enablePhysics = vi.fn(() => {
    engine = { setTimeStep: vi.fn((t: number) => (timeStep = t)), getTimeStep: () => timeStep };
    return true;
  });
  const disablePhysicsEngine = vi.fn(() => (engine = null));
  return {
    scene: {
      getPhysicsEngine: () => engine,
      enablePhysics,
      disablePhysicsEngine,
    },
    enablePhysics,
    disablePhysicsEngine,
    timeStep: () => timeStep,
  };
}

describe('PhysicsManager engine lifecycle', () => {
  let s: ReturnType<typeof makeScene>;
  let pm: PhysicsManager;

  beforeEach(() => {
    s = makeScene();
    pm = new PhysicsManager({
      scene: s.scene as never,
      mode: '3d',
      getMesh: () => undefined,
      getMeshKind: () => 'box',
    });
  });
  afterEach(() => vi.clearAllMocks());

  it('keeps the Havok engine alive across Stop so the next Play still has one', async () => {
    await pm.enablePhysics([]);
    expect(s.enablePhysics).toHaveBeenCalledTimes(1);
    expect(pm.physicsActive).toBe(true);

    pm.disablePhysics();
    expect(pm.physicsActive).toBe(false);
    // The regression: tearing the engine down here disposes the (unreusable) plugin,
    // breaking the next Play with "No Physics Engine available."
    expect(s.disablePhysicsEngine).not.toHaveBeenCalled();

    // Second Play reuses the existing engine instead of re-enabling a dead plugin.
    await pm.enablePhysics([]);
    expect(s.enablePhysics).toHaveBeenCalledTimes(1);
    expect(pm.physicsActive).toBe(true);
  });

  it('normalizes the timestep on Play so a prior Pause-freeze + Stop never leaks', async () => {
    await pm.enablePhysics([]);
    pm.setPaused(true); // freeze: timestep -> 0
    expect(s.timeStep()).toBe(0);

    pm.disablePhysics(); // Stop while frozen (engine stays alive at timestep 0)
    await pm.enablePhysics([]); // next Play must un-freeze
    expect(s.timeStep()).toBe(1 / 60);
  });
});
