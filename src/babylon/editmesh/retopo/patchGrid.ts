import type { V3 } from '@/kernel/HalfEdgeMesh';

/**
 * Fill a 4-sided patch with a quad grid. Given the four boundary curves (each already
 * resampled to the same `R + 1` points, oriented to form a closed loop), {@link coonsGrid}
 * interpolates the interior with a bilinearly-blended Coons patch, and {@link gridQuads} emits
 * the quad face loops. Pure (no Babylon) for unit testing; the caller projects the resulting
 * interior points onto the reference surface.
 *
 * Boundary orientation expected (corners c0..c3 of the loop c0→c1→c2→c3→c0):
 *   bottom: c0→c1   right: c1→c2   top: c3→c2   left: c0→c3
 * i.e. `top` and `left` run the SAME direction as the grid's u/v axes (not reversed), so
 * grid[i][j] uses bottom[j]/top[j] (u = j) and left[i]/right[i] (v = i).
 */
export function coonsGrid(bottom: V3[], right: V3[], top: V3[], left: V3[]): V3[][] {
  const cols = bottom.length; // R + 1 across (u = j / (cols-1))
  const rows = left.length; // R + 1 down  (v = i / (rows-1))
  const c00 = bottom[0];
  const c01 = bottom[cols - 1];
  const c10 = top[0];
  const c11 = top[cols - 1];
  const grid: V3[][] = [];
  for (let i = 0; i < rows; i++) {
    const v = i / (rows - 1);
    const row: V3[] = [];
    for (let j = 0; j < cols; j++) {
      const u = j / (cols - 1);
      const b = bottom[j];
      const t = top[j];
      const l = left[i];
      const r = right[i];
      const p: V3 = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        // Lc (along v) + Ld (along u) − bilinear blend of the corners.
        const lc = (1 - v) * b[k] + v * t[k];
        const ld = (1 - u) * l[k] + u * r[k];
        const bilinear =
          (1 - u) * (1 - v) * c00[k] + u * (1 - v) * c01[k] + (1 - u) * v * c10[k] + u * v * c11[k];
        p[k] = lc + ld - bilinear;
      }
      row.push(p);
    }
    grid.push(row);
  }
  return grid;
}

/** Quad face loops for a `rows × cols` point grid, indexed `i * cols + j`. Winding is
 *  consistent (CCW in grid space) so the kernel links them cleanly. */
export function gridQuads(rows: number, cols: number): number[][] {
  const faces: number[][] = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      faces.push([a, a + 1, a + cols + 1, a + cols]);
    }
  }
  return faces;
}
