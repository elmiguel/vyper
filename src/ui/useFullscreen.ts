import { useCallback, useEffect, useState, type RefObject } from 'react';

/**
 * Toggle the browser Fullscreen API for one specific element.
 *
 * Returns `isFullscreen` — true only when *this* element (not some other one)
 * is the current fullscreen element — and `toggle()` to enter/exit. Tracks
 * external changes (e.g. the user pressing Esc) via the `fullscreenchange`
 * event, so the UI stays in sync however fullscreen is left.
 */
export function useFullscreen(ref: RefObject<HTMLElement>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!ref.current && document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', onChange);
    onChange();
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [ref]);

  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      document.exitFullscreen?.();
    } else {
      el.requestFullscreen?.();
    }
  }, [ref]);

  return { isFullscreen, toggle };
}
