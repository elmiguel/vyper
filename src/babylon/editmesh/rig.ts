import type { Vec3, RigBone, RigSkeleton, SkinData } from '@/types';

/**
 * Pure rigging math — skeleton posing (forward kinematics), distance-based automatic
 * weighting, and linear-blend skinning. No Babylon dependency, so the deformation is
 * unit-testable. Bones are rigid (rotation + translation, no scale) and rest in their
 * world-aligned orientation; posing a bone rotates it about its head, carrying its
 * children, which is the simple-skeleton model the Modeling Studio targets.
 */

export type { RigBone, RigSkeleton, SkinData } from '@/types';

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const IDENTITY_QUAT: Quat = { x: 0, y: 0, z: 0, w: 1 };

export function quatMul(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

/** Rotate a vector by a unit quaternion. */
export function quatRotate(q: Quat, v: Vec3): Vec3 {
  // t = 2 * cross(q.xyz, v); v' = v + q.w * t + cross(q.xyz, t)
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

/** Quaternion from XYZ Euler angles in **degrees**. */
export function quatFromEuler(xDeg: number, yDeg: number, zDeg: number): Quat {
  const r = Math.PI / 360; // half-angle in radians, per axis
  const cx = Math.cos(xDeg * r);
  const sx = Math.sin(xDeg * r);
  const cy = Math.cos(yDeg * r);
  const sy = Math.sin(yDeg * r);
  const cz = Math.cos(zDeg * r);
  const sz = Math.sin(zDeg * r);
  return {
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  };
}

/** A bone's posed world rotation + posed head position (for skinning/display). */
export interface PosedBone {
  worldRot: Quat;
  head: Vec3;
  restHead: Vec3;
}

/**
 * Forward-kinematics pose: resolve each bone's world rotation and posed head from the
 * per-bone local rotations (relative to parent). Bones are visited parents-first.
 */
export function poseBones(skel: RigSkeleton, localRot: Record<string, Quat>): Map<string, PosedBone> {
  const byId = new Map(skel.bones.map((b) => [b.id, b]));
  const out = new Map<string, PosedBone>();
  const resolve = (bone: RigBone): PosedBone => {
    const cached = out.get(bone.id);
    if (cached) return cached;
    const local = localRot[bone.id] ?? IDENTITY_QUAT;
    const parent = bone.parentId ? byId.get(bone.parentId) : undefined;
    let posed: PosedBone;
    if (!parent) {
      posed = { worldRot: local, head: { ...bone.head }, restHead: bone.head };
    } else {
      const p = resolve(parent);
      const worldRot = quatMul(p.worldRot, local);
      const offset = { x: bone.head.x - parent.head.x, y: bone.head.y - parent.head.y, z: bone.head.z - parent.head.z };
      const ro = quatRotate(p.worldRot, offset);
      posed = { worldRot, head: { x: p.head.x + ro.x, y: p.head.y + ro.y, z: p.head.z + ro.z }, restHead: bone.head };
    }
    out.set(bone.id, posed);
    return posed;
  };
  for (const b of skel.bones) resolve(b);
  return out;
}

/** Closest distance from point p to the segment [a,b]. */
function distToSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz || 1e-9;
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  const cz = a.z + abz * t;
  return Math.hypot(p.x - cx, p.y - cy, p.z - cz);
}

/**
 * Distance-based automatic weights: each vertex is bound to the nearest bones by
 * inverse-square distance to the bone segment, keeping the top {@link maxInfluences}
 * (≤4), normalized to sum to 1. Returns Babylon-layout flat arrays (4 per vertex).
 */
export function autoWeights(positions: number[], skel: RigSkeleton, maxInfluences = 4): SkinData {
  const k = Math.min(4, Math.max(1, maxInfluences));
  const indices: number[] = [];
  const weights: number[] = [];
  const vcount = positions.length / 3;
  for (let i = 0; i < vcount; i++) {
    const p = { x: positions[i * 3], y: positions[i * 3 + 1], z: positions[i * 3 + 2] };
    const scored = skel.bones.map((b, bi) => ({ bi, w: 1 / (distToSegment(p, b.head, b.tail) ** 2 + 1e-4) }));
    scored.sort((a, b) => b.w - a.w);
    const top = scored.slice(0, k);
    const sum = top.reduce((s, t) => s + t.w, 0) || 1;
    for (let j = 0; j < 4; j++) {
      indices.push(j < top.length ? top[j].bi : 0);
      weights.push(j < top.length ? top[j].w / sum : 0);
    }
  }
  return { indices, weights };
}

/**
 * Linear-blend skinning: deform rest positions by the posed skeleton using the skin
 * weights. For each influence i: contribution = worldRot_i·(v − restHead_i) + posedHead_i.
 * Returns a fresh flat positions array.
 */
export function linearBlendSkin(positions: number[], skin: SkinData, skel: RigSkeleton, posed: Map<string, PosedBone>): number[] {
  const bonePosed = skel.bones.map((b) => posed.get(b.id));
  const out = new Array(positions.length);
  const vcount = positions.length / 3;
  for (let i = 0; i < vcount; i++) {
    const v = { x: positions[i * 3], y: positions[i * 3 + 1], z: positions[i * 3 + 2] };
    let ox = 0;
    let oy = 0;
    let oz = 0;
    let wsum = 0;
    for (let j = 0; j < 4; j++) {
      const w = skin.weights[i * 4 + j];
      if (w <= 0) continue;
      const pb = bonePosed[skin.indices[i * 4 + j]];
      if (!pb) continue;
      const local = { x: v.x - pb.restHead.x, y: v.y - pb.restHead.y, z: v.z - pb.restHead.z };
      const r = quatRotate(pb.worldRot, local);
      ox += (r.x + pb.head.x) * w;
      oy += (r.y + pb.head.y) * w;
      oz += (r.z + pb.head.z) * w;
      wsum += w;
    }
    if (wsum > 1e-6) {
      out[i * 3] = ox / wsum;
      out[i * 3 + 1] = oy / wsum;
      out[i * 3 + 2] = oz / wsum;
    } else {
      out[i * 3] = v.x;
      out[i * 3 + 1] = v.y;
      out[i * 3 + 2] = v.z;
    }
  }
  return out;
}
