import type { V3 } from '@/kernel/HalfEdgeMesh';

/**
 * Project a point onto a reference surface for sketch retopology: {@link closestPointOnSoup}
 * returns the nearest point on a triangle soup (the reference mesh's render triangles). Used to
 * fit the generated quad-cage vertices onto the surface they were sketched over. Pure (no
 * Babylon), so it's unit-testable.
 *
 * Brute force — O(triangles) per query. Fine for studio-sized meshes; a spatial accelerator
 * (BVH/grid) is the obvious optimization if reference meshes get large.
 */
export function closestPointOnSoup(p: V3, positions: number[], indices: number[]): V3 {
  let best: V3 = p;
  let bestD2 = Infinity;
  for (let t = 0; t < indices.length; t += 3) {
    const a = vertex(positions, indices[t]);
    const b = vertex(positions, indices[t + 1]);
    const c = vertex(positions, indices[t + 2]);
    const q = closestOnTriangle(p, a, b, c);
    const d2 = dist2(p, q);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = q;
    }
  }
  return best;
}

function vertex(positions: number[], i: number): V3 {
  return [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dist2 = (a: V3, b: V3): number => {
  const d = sub(a, b);
  return dot(d, d);
};

/** Closest point on triangle abc to p (Ericson, Real-Time Collision Detection — Voronoi regions). */
function closestOnTriangle(p: V3, a: V3, b: V3, c: V3): V3 {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a; // vertex region A

  const bp = sub(p, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b; // vertex region B

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3); // edge AB
    return [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v];
  }

  const cp = sub(p, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c; // vertex region C

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6); // edge AC
    return [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w];
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); // edge BC
    return [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w];
  }

  // Inside the face — barycentric combination.
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}
