import { describe, it, expect, vi, beforeEach } from 'vitest';

// The game SceneManager is the fallback capturer; stub it so no Babylon graph is pulled in.
vi.mock('@/babylon/engine', () => ({ getManager: () => ({ captureThumbnail: () => 'data:game' }) }));

import { ensureAutoCover, captureViewportCover, setViewportCapturer } from './projectCover';

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

describe('captureViewportCover — capturer precedence', () => {
  beforeEach(() => setViewportCapturer(null));

  it('uses the game SceneManager when nothing is registered', () => {
    expect(captureViewportCover()).toBe('data:game');
  });

  it('prefers a registered capturer (e.g. the Modeling Studio) over the game manager', () => {
    setViewportCapturer(() => 'data:studio');
    expect(captureViewportCover()).toBe('data:studio');
  });

  it('falls back to the game manager when the registered capturer yields null', () => {
    setViewportCapturer(() => null);
    expect(captureViewportCover()).toBe('data:game');
  });

  it('clearing the capturer restores the game-manager fallback', () => {
    setViewportCapturer(() => 'data:studio');
    setViewportCapturer(null);
    expect(captureViewportCover()).toBe('data:game');
  });
});
