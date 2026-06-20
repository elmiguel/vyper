import { describe, it, expect } from 'vitest';
import { pickEntityScript } from './scriptSelection';

const valid = (...ids: string[]) => new Set(ids);

describe('pickEntityScript', () => {
  it('returns null when the entity has no scripts', () => {
    expect(pickEntityScript(undefined, valid('a'), undefined)).toBeNull();
    expect(pickEntityScript([], valid('a'), undefined)).toBeNull();
  });

  it('returns null when none of the entity scripts still exist', () => {
    expect(pickEntityScript(['ghost'], valid('a', 'b'), undefined)).toBeNull();
  });

  it('defaults to the first attached script', () => {
    expect(pickEntityScript(['s1', 's2'], valid('s1', 's2'), undefined)).toBe('s1');
  });

  it('prefers the last-used script when it is still attached', () => {
    expect(pickEntityScript(['s1', 's2'], valid('s1', 's2'), 's2')).toBe('s2');
  });

  it('falls back to the first when the last-used script was detached', () => {
    expect(pickEntityScript(['s1', 's2'], valid('s1', 's2'), 'gone')).toBe('s1');
  });

  it('skips dangling ids when choosing the first', () => {
    expect(pickEntityScript(['ghost', 's2'], valid('s2'), undefined)).toBe('s2');
  });
});
