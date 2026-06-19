import { describe, it, expect, vi } from 'vitest';
import { hmrSingleton } from './hmrStore';

describe('hmrSingleton', () => {
  it('runs the factory once per key and returns the cached instance after', () => {
    const factory = vi.fn(() => ({ n: Math.floor(1) }));
    const a = hmrSingleton('test-key', factory);
    const b = hmrSingleton('test-key', factory);
    expect(a).toBe(b); // same instance across calls (survives module re-eval)
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('keeps separate instances for different keys', () => {
    const a = hmrSingleton('k1', () => ({}));
    const b = hmrSingleton('k2', () => ({}));
    expect(a).not.toBe(b);
  });
});
