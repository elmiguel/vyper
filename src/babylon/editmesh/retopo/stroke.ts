import type { V3 } from '@/kernel/HalfEdgeMesh';

/**
 * Freehand-stroke geometry for sketch retopology: turn the raw, jittery points captured while
 * dragging into a clean "vector path" on the surface — first {@link simplifyPolyline} to drop
 * redundant points, then {@link resampleCurve} to lay evenly-spaced samples along a smooth
 * Catmull-Rom spline through them. Pure (no Babylon), so it's unit-testable.
 */

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3): number => Math.sqrt(dot(a, a));

/** Perpendicular distance from point `p` to the segment a→b (3D). */
function distToSegment(p: V3, a: V3, b: V3): number {
  const ab = sub(b, a);
  const ab2 = dot(ab, ab);
  if (ab2 === 0) return len(sub(p, a));
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / ab2));
  const proj: V3 = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
  return len(sub(p, proj));
}

/** Douglas–Peucker: drop points that lie within `epsilon` (world units) of the chord, keeping
 *  the polyline's shape with far fewer vertices. Endpoints are always preserved. */
export function simplifyPolyline(pts: V3[], epsilon: number): V3[] {
  if (pts.length <= 2) return pts.slice();
  let maxD = -1;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToSegment(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= epsilon) return [pts[0], pts[pts.length - 1]];
  const left = simplifyPolyline(pts.slice(0, idx + 1), epsilon);
  const right = simplifyPolyline(pts.slice(idx), epsilon);
  return left.slice(0, -1).concat(right); // drop the shared joint point
}

/** Catmull-Rom point on the segment p1→p2 at local parameter `t` (0..1); p0/p3 are neighbours. */
function catmullRom(p0: V3, p1: V3, p2: V3, p3: V3, t: number): V3 {
  const t2 = t * t;
  const t3 = t2 * t;
  const out: V3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    out[k] =
      0.5 *
      (2 * p1[k] +
        (-p0[k] + p2[k]) * t +
        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
        (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
  }
  return out;
}

/**
 * Resample a polyline into `segments + 1` points evenly spaced (by arc length) along a smooth
 * Catmull-Rom spline through the input points. The first and last input points are preserved.
 * Returns the input unchanged when it can't form a curve.
 */
export function resampleCurve(pts: V3[], segments: number): V3[] {
  if (segments < 1 || pts.length < 2) return pts.slice();
  // Densely sample the spline, then walk it at uniform arc-length steps.
  const dense: V3[] = [];
  const STEPS = 24; // per input segment
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < pts.length ? i + 2 : pts.length - 1];
    for (let s = 0; s < STEPS; s++) dense.push(catmullRom(p0, p1, p2, p3, s / STEPS));
  }
  dense.push(pts[pts.length - 1]);

  // Cumulative arc length along the dense polyline.
  const cum: number[] = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + len(sub(dense[i], dense[i - 1])));
  const total = cum[cum.length - 1];
  if (total === 0) return [pts[0], pts[pts.length - 1]];

  const out: V3[] = [dense[0]];
  let j = 1;
  for (let n = 1; n < segments; n++) {
    const target = (total * n) / segments;
    while (j < cum.length - 1 && cum[j] < target) j++;
    const t = (target - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
    const a = dense[j - 1];
    const b = dense[j];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  }
  out.push(dense[dense.length - 1]);
  return out;
}
