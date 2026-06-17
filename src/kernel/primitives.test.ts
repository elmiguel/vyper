import { describe, it, expect } from 'vitest';
import { buildPrimitive, type KernelPrimitive } from './primitives';
import { validateMesh } from './validate';

describe('buildPrimitive', () => {
  const kinds: KernelPrimitive[] = ['cube', 'plane', 'grid', 'cylinder', 'sphere', 'cone', 'torus'];
  for (const kind of kinds) {
    it(`builds a well-formed ${kind}`, () => {
      const m = buildPrimitive(kind, 2);
      expect(m.liveFaces().length).toBeGreaterThan(0);
      expect(validateMesh(m)).toEqual([]);
    });
  }
});
