import { describe, it, expect, vi } from 'vitest';
import { ensureAutoCover } from './projectCover';

describe('ensureAutoCover', () => {
  it('fills a missing cover from the capture callback', () => {
    const s: Record<string, unknown> = { kind: '3d' };
    ensureAutoCover(s, () => 'data:image/jpeg;base64,thumb');
    expect(s.coverImage).toBe('data:image/jpeg;base64,thumb');
  });

  it('leaves an assigned cover untouched and never captures', () => {
    const capture = vi.fn(() => 'new');
    const s: Record<string, unknown> = { kind: '3d', coverImage: 'data:existing' };
    ensureAutoCover(s, capture);
    expect(s.coverImage).toBe('data:existing');
    expect(capture).not.toHaveBeenCalled();
  });

  it('stays uncovered when the viewport capture is unavailable (null)', () => {
    const s: Record<string, unknown> = { kind: '3d' };
    ensureAutoCover(s, () => null);
    expect(s.coverImage).toBeUndefined();
  });
});
