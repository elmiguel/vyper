/**
 * Pure geometry for the interactive loop-cut drag (no Babylon deps, so it's unit-testable).
 * The viewport supplies projected screen points; these helpers turn cursor motion into a
 * slide ratio (move mode) or pick the best loop direction by drag angle (rotate mode).
 */

/** Clamp to the [0,1] slide range. */
export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Slide ratio of the cursor projected onto the screen-space segment a→b, clamped to [0,1].
 *  For a fan spoke (apex→rim) this is the ratio from the apex. */
export function slideRatio(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return 0.5;
  return clamp01(((px - ax) * dx + (py - ay) * dy) / len2);
}

/** Orientation of a screen vector folded to a line angle in [0,π) (edges are undirected). */
export function lineAngle(dx: number, dy: number): number {
  let a = Math.atan2(dy, dx);
  if (a < 0) a += Math.PI;
  if (a >= Math.PI) a -= Math.PI;
  return a;
}

/** Index of the angle nearest `target`, comparing as undirected lines (mod π). -1 if empty. */
export function nearestAngleIndex(angles: number[], target: number): number {
  let best = -1;
  let bestD = Infinity;
  angles.forEach((a, i) => {
    let d = Math.abs(a - target) % Math.PI;
    d = Math.min(d, Math.PI - d);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
