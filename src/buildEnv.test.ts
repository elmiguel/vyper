import { afterEach, describe, expect, it } from 'vitest';
import { isDesktop } from './buildEnv';

afterEach(() => {
  delete (window as unknown as { vyper?: unknown }).vyper;
});

describe('isDesktop', () => {
  it('is false on the web (no preload bridge)', () => {
    expect(isDesktop()).toBe(false);
  });

  it('is true when the Electron preload bridge is present', () => {
    (window as unknown as { vyper?: unknown }).vyper = { invoke: async () => undefined };
    expect(isDesktop()).toBe(true);
  });
});
