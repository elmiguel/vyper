import { describe, expect, it } from 'vitest';
import { isMeshCollidable } from './index';

describe('isMeshCollidable', () => {
  it('treats an absent mesh as not collidable', () => {
    expect(isMeshCollidable(undefined)).toBe(false);
  });

  it('treats absent/undefined collision as collidable (backward compatible)', () => {
    expect(isMeshCollidable({})).toBe(true);
    expect(isMeshCollidable({ collision: undefined })).toBe(true);
  });

  it('respects an explicit collision flag', () => {
    expect(isMeshCollidable({ collision: true })).toBe(true);
    expect(isMeshCollidable({ collision: false })).toBe(false);
  });
});
