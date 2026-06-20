import { useCallback, useRef, useState } from 'react';

/**
 * Drag-to-scrub for numeric fields. Press on the field and drag to change its
 * value the way 3D editors do: dragging right OR up increases it, left OR down
 * decreases it. Combining both axes (`dx - dy`) means the user can move the
 * mouse in whatever direction is comfortable and the value still tracks the
 * gesture, so a short flick up-and-to-the-right reads the same as a long drag
 * straight across.
 *
 * A plain click (movement under {@link DRAG_THRESHOLD}px) is left alone so the
 * field still focuses for keyboard entry — only a real drag scrubs.
 *
 * Modifiers tune sensitivity: Shift = ×10 (coarse), Alt = ×0.1 (fine).
 */

/** Pixels of movement before a press is treated as a scrub rather than a click. */
export const DRAG_THRESHOLD = 3;

/** Sensitivity multiplier from the held modifier keys. */
export function scrubMultiplier(e: { shiftKey: boolean; altKey: boolean }): number {
  if (e.shiftKey) return 10; // coarse
  if (e.altKey) return 0.1; // fine
  return 1;
}

/**
 * Pure value math for a scrub gesture, factored out so it can be unit-tested
 * without a DOM. `dx`/`dy` are the pixel offsets from where the drag began.
 */
export function computeScrubValue(
  base: number,
  dx: number,
  dy: number,
  unit: number,
  mult: number,
  min?: number,
  max?: number,
): number {
  // Right (+dx) and up (−dy, since screen-y grows downward) both increase.
  const pixels = dx - dy;
  let next = base + pixels * unit * mult;
  // Strip binary-float dust like 0.1 + 0.2 → 0.30000000000000004.
  next = Number(next.toFixed(6));
  if (min != null && next < min) next = min;
  if (max != null && next > max) next = max;
  return next;
}

export interface DragScrubOptions {
  value: number;
  onChange: (v: number) => void;
  /** Value change per pixel dragged (before modifiers). Defaults to 0.1. */
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
}

/**
 * Returns pointer handlers to spread onto a numeric field plus a `scrubbing`
 * flag for styling. The gesture is anchored to the value captured on
 * pointer-down, so cumulative drag stays exact even as the field re-renders
 * with each intermediate `onChange`.
 */
export function useDragScrub({ value, onChange, step, min, max, disabled }: DragScrubOptions) {
  const [scrubbing, setScrubbing] = useState(false);
  const drag = useRef<{ x: number; y: number; base: number; active: boolean } | null>(null);
  const unit = step && step > 0 ? step : 0.1;

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (disabled || e.button !== 0) return;
      drag.current = { x: e.clientX, y: e.clientY, base: Number.isFinite(value) ? value : 0, active: false };
    },
    [disabled, value],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.active) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        d.active = true;
        setScrubbing(true);
        e.currentTarget.setPointerCapture?.(e.pointerId);
        e.currentTarget.blur(); // drop the caret so the field reads as a scrub surface
      }
      e.preventDefault(); // suppress text selection while dragging
      onChange(computeScrubValue(d.base, dx, dy, unit, scrubMultiplier(e), min, max));
    },
    [onChange, unit, min, max],
  );

  const end = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    if (d?.active) {
      setScrubbing(false);
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    }
  }, []);

  return {
    scrubbing,
    scrubHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
    },
  };
}
