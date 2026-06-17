import { describe, it, expect } from 'vitest';
import { physicsModeOf, type PhysicsConfig } from './index';

const phys = (over: Partial<PhysicsConfig>): PhysicsConfig => ({
  enabled: true,
  type: 'dynamic',
  mass: 1,
  restitution: 0.2,
  friction: 0.6,
  shape: 'auto',
  ...over,
});

describe('physicsModeOf', () => {
  it('is "none" when physics is absent', () => {
    expect(physicsModeOf(undefined)).toBe('none');
  });

  it('is "none" when physics is disabled (regardless of type)', () => {
    expect(physicsModeOf(phys({ enabled: false, type: 'static' }))).toBe('none');
    expect(physicsModeOf(phys({ enabled: false, type: 'dynamic' }))).toBe('none');
  });

  it('is "solid" for an enabled static body', () => {
    expect(physicsModeOf(phys({ enabled: true, type: 'static' }))).toBe('solid');
  });

  it('is "rigid" for enabled dynamic and kinematic bodies', () => {
    expect(physicsModeOf(phys({ enabled: true, type: 'dynamic' }))).toBe('rigid');
    expect(physicsModeOf(phys({ enabled: true, type: 'kinematic' }))).toBe('rigid');
  });
});
