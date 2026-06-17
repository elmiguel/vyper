import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createRef } from 'react';
import { useFullscreen } from './useFullscreen';

// jsdom has no real Fullscreen API; stub the pieces the hook touches and drive
// `document.fullscreenElement` to simulate entering/leaving fullscreen.
let current: Element | null = null;

function makeEl(): HTMLElement {
  const el = document.createElement('div');
  el.requestFullscreen = vi.fn(async () => {
    current = el;
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  return el;
}

beforeEach(() => {
  current = null;
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => current });
  document.exitFullscreen = vi.fn(async () => {
    current = null;
    document.dispatchEvent(new Event('fullscreenchange'));
  });
});

describe('useFullscreen', () => {
  it('starts not-fullscreen and requests fullscreen on the element when toggled', () => {
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement }).current = makeEl();
    const { result } = renderHook(() => useFullscreen(ref));

    expect(result.current.isFullscreen).toBe(false);
    act(() => result.current.toggle());

    expect(ref.current!.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(result.current.isFullscreen).toBe(true);
  });

  it('exits fullscreen when toggled while this element is fullscreen', () => {
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement }).current = makeEl();
    const { result } = renderHook(() => useFullscreen(ref));

    act(() => result.current.toggle()); // enter
    act(() => result.current.toggle()); // exit

    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(result.current.isFullscreen).toBe(false);
  });

  it('reflects external exit (e.g. Esc) via the fullscreenchange event', () => {
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement }).current = makeEl();
    const { result } = renderHook(() => useFullscreen(ref));

    act(() => result.current.toggle());
    expect(result.current.isFullscreen).toBe(true);

    act(() => {
      current = null; // browser leaves fullscreen without our toggle
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(result.current.isFullscreen).toBe(false);
  });

  it('is a no-op when the ref is empty', () => {
    const ref = createRef<HTMLElement>();
    const { result } = renderHook(() => useFullscreen(ref));
    expect(() => act(() => result.current.toggle())).not.toThrow();
    expect(result.current.isFullscreen).toBe(false);
  });
});
