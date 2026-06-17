import { describe, expect, it } from 'vitest';
import { isSceneEditable } from './index';

describe('isSceneEditable', () => {
  it('allows editing while editing and while paused', () => {
    expect(isSceneEditable('editing')).toBe(true);
    expect(isSceneEditable('paused')).toBe(true);
  });

  it('locks editing while playing (runtime owns transforms)', () => {
    expect(isSceneEditable('playing')).toBe(false);
  });
});
