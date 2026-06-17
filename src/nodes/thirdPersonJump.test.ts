import { describe, expect, it, vi } from 'vitest';
import { generateCode } from './codegen';
import { makeNode } from './nodeTypes';
import type { ScriptGraph } from '@/types';

/**
 * The third-person controller is a plug-and-play asset node. This compiles the
 * REAL generated code (the same path ScriptRuntime runs) and drives onUpdate with
 * mocks, to pin down whether Space + grounded actually fires the jump impulse —
 * independent of the Havok runtime.
 */
function compileController() {
  const graph: ScriptGraph = { nodes: [makeNode('asset/thirdPersonController', { x: 0, y: 0 })], edges: [] };
  const code = generateCode(graph);
  // Mirror ScriptRuntime's factory wrapping.
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
    `${code}\n; return { onStart: typeof onStart !== 'undefined' ? onStart : null, onUpdate: typeof onUpdate !== 'undefined' ? onUpdate : null };`,
  );
  return factory;
}

function harness(opts: { space: boolean; grounded: boolean }) {
  const applyImpulse = vi.fn();
  const setVelocity = vi.fn();
  const scale = () => ({ scale: () => ({ x: 0, z: 0 }), add: () => ({ x: 0, z: 0 }) });
  const entity = {
    getVelocity: () => ({ x: 0, y: 0, z: 0 }),
    setVelocity,
    applyImpulse,
    isGrounded: () => opts.grounded,
    position: { x: 0, y: 0, z: 0 },
    props: {} as Record<string, unknown>, // edge-trigger stores jumpHeld here
  };
  const input = {
    key: (k: string) => (k === ' ' ? opts.space : false),
    mouse: { dx: 0, dy: 0 },
    axisX: 0,
    axisY: 0,
  };
  const camera = {
    yaw: 0,
    pitch: 0,
    forwardXZ: { scale: () => ({ add: (v: unknown) => v, x: 0, z: 0 }) },
    rightXZ: { scale: () => ({ x: 0, z: 0 }) },
    followThirdPerson: vi.fn(),
  };
  void scale;
  return { entity, input, camera, applyImpulse, setVelocity };
}

/** setVelocity calls that are jumps (upward y), not horizontal movement (y≈0). */
const jumpCalls = (setVelocity: ReturnType<typeof vi.fn>) =>
  setVelocity.mock.calls.filter((c) => (c[1] as number) > 1);

describe('third-person controller jump (generated code)', () => {
  it('the generated update sets a non-zero upward take-off velocity, gated on grounded', () => {
    const graph: ScriptGraph = { nodes: [makeNode('asset/thirdPersonController', { x: 0, y: 0 })], edges: [] };
    const code = generateCode(graph);
    expect(code).toContain("input.key(' ')");
    expect(code).toContain('entity.isGrounded()');
    // Jump sets velocity (deterministic height) rather than adding an impulse.
    expect(code).toMatch(/entity\.setVelocity\(v\.x, \d+\.\d+, v\.z\)/);
    expect(code).not.toMatch(/entity\.setVelocity\(v\.x, 0\.00, v\.z\)/);
  });

  it('sets an upward velocity when Space is pressed and grounded', () => {
    const factory = compileController();
    const h = harness({ space: true, grounded: true });
    const lc = factory(h.entity, {}, h.input, { delta: 0.016 }, {}, h.camera, {}, console, () => {});
    lc.onUpdate(0.016);
    const jumps = jumpCalls(h.setVelocity);
    expect(jumps).toHaveLength(1);
    expect(jumps[0][1]).toBeGreaterThan(4); // ≈4.85 upward (height 1.2)
  });

  it('does NOT jump when grounded but Space is not held', () => {
    const factory = compileController();
    const h = harness({ space: false, grounded: true });
    const lc = factory(h.entity, {}, h.input, { delta: 0.016 }, {}, h.camera, {}, console, () => {});
    lc.onUpdate(0.016);
    expect(jumpCalls(h.setVelocity)).toHaveLength(0);
  });

  it('does NOT jump when Space is held but airborne', () => {
    const factory = compileController();
    const h = harness({ space: true, grounded: false });
    const lc = factory(h.entity, {}, h.input, { delta: 0.016 }, {}, h.camera, {}, console, () => {});
    lc.onUpdate(0.016);
    expect(jumpCalls(h.setVelocity)).toHaveLength(0);
  });

  it('jumps only ONCE while Space is held (edge-triggered, no stacking/launch)', () => {
    const factory = compileController();
    const h = harness({ space: true, grounded: true }); // held + grounded for many frames
    const lc = factory(h.entity, {}, h.input, { delta: 0.016 }, {}, h.camera, {}, console, () => {});
    lc.onUpdate(0.016);
    lc.onUpdate(0.016);
    lc.onUpdate(0.016);
    expect(jumpCalls(h.setVelocity)).toHaveLength(1); // not 3 — the old bug launched the player
  });
});
