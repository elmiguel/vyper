// Pure terrain heightfield math — no Babylon, no DOM, so the sculpt brushes are
// fully unit-testable. A heightfield is a row-major array of (n × n) normalized
// heights in [0, 1]; the mesh multiplies them by `maxHeight` at build time.

import type { BrushMode, BrushParams } from '@/types';

export type { BrushMode, BrushParams } from '@/types';

/**
 * Resolve the effective brush mode for a sculpt stroke from held modifier keys:
 * Ctrl flattens, Shift smooths, Cmd (macOS) / Alt (Windows) digs (lowers), and a
 * plain drag uses the selected brush mode (raise by default). Pure → unit-testable.
 */
export function resolveBrushMode(
  mode: BrushMode,
  mods: { ctrl: boolean; shift: boolean; invert: boolean },
): BrushMode {
  if (mods.ctrl) return 'flatten';
  if (mods.shift) return 'smooth';
  if (mods.invert) return 'lower';
  return mode;
}

/** Grid side length (vertices per row) for a terrain of `subdivisions`. */
export const gridSize = (subdivisions: number): number => subdivisions + 1;

/** A flat heightfield of all zeros for the given subdivisions. */
export function flatHeights(subdivisions: number): number[] {
  const n = gridSize(subdivisions);
  return new Array(n * n).fill(0);
}

/** Smooth falloff in [0,1]: 1 at the brush center, 0 at/after its edge. */
export function falloff(distance: number, radius: number): number {
  if (radius <= 0 || distance >= radius) return 0;
  const t = 1 - distance / radius;
  return t * t * (3 - 2 * t); // smoothstep
}

/** Convert a local-space hit (x,z in [-size/2, size/2]) to fractional grid coords. */
export function hitToGrid(hitX: number, hitZ: number, size: number, n: number): { gx: number; gz: number } {
  const half = size / 2;
  return {
    gx: ((hitX + half) / size) * (n - 1),
    gz: ((hitZ + half) / size) * (n - 1),
  };
}

/**
 * Apply one brush dab to a heightfield, returning a NEW array (the input is not
 * mutated). `hitX/hitZ` are local-space coordinates of the cursor on the terrain.
 * raise/lower add or subtract a falloff-weighted amount; flatten pulls toward the
 * center height; smooth pulls each affected vertex toward its 4-neighbour average.
 */
export function applyBrush(
  heights: number[],
  subdivisions: number,
  size: number,
  hitX: number,
  hitZ: number,
  p: BrushParams,
): number[] {
  const n = gridSize(subdivisions);
  const out = heights.slice();
  const spacing = size / subdivisions;
  const radiusCells = Math.ceil(p.radius / spacing) + 1;
  const { gx, gz } = hitToGrid(hitX, hitZ, size, n);
  const ci = Math.round(gx);
  const cj = Math.round(gz);
  const centerHeight = heights[clampIdx(cj, n) * n + clampIdx(ci, n)] ?? 0;

  for (let j = cj - radiusCells; j <= cj + radiusCells; j++) {
    for (let i = ci - radiusCells; i <= ci + radiusCells; i++) {
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const dx = (i - gx) * spacing;
      const dz = (j - gz) * spacing;
      const dist = Math.hypot(dx, dz);
      const w = falloff(dist, p.radius);
      if (w === 0) continue;
      const idx = j * n + i;
      const h = out[idx];
      let next = h;
      if (p.mode === 'raise') next = h + p.strength * w;
      else if (p.mode === 'lower') next = h - p.strength * w;
      else if (p.mode === 'flatten') next = h + (centerHeight - h) * p.strength * w;
      else next = h + (neighbourAvg(out, i, j, n) - h) * p.strength * w; // smooth
      out[idx] = clamp01(next);
    }
  }
  return out;
}

function neighbourAvg(h: number[], i: number, j: number, n: number): number {
  let sum = 0;
  let count = 0;
  for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    const ni = i + di;
    const nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
    sum += h[nj * n + ni];
    count++;
  }
  return count ? sum / count : h[j * n + i];
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clampIdx = (v: number, n: number) => (v < 0 ? 0 : v >= n ? n - 1 : v);
