import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
// Side effect: augments Mesh with thinInstance* methods in the tree-shaken build.
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { Entity, GrassConfig, TerrainConfig } from '@/types';
import { defaultGrass, defaultTerrain } from '@/types';
import { buildFoliageMaterial, applyFoliageConfig } from './foliageMaterial';
import { DEFAULT_LAYER } from './sceneBuilders';

/**
 * Grows a scattered grass field over a host mesh's surface. Blades are
 * thin-instanced (one draw call) and share the foliage material, so a full field
 * of thousands of blades stays cheap. For terrain hosts the blade Y is sampled
 * from the heightfield (exact, no raycast); other meshes scatter across the top of
 * their bounding box. The field is deterministic per entity id, so it looks
 * identical across rebuilds and in every viewport.
 */

/** Hard cap so a runaway density can't allocate an absurd buffer. */
const MAX_BLADES = 60000;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Number of blades for a config over a given surface area (exported for tests). */
export function bladeCountFor(cfg: GrassConfig, area: number): number {
  return clamp(Math.round(cfg.density * area), 0, MAX_BLADES);
}

/** Small deterministic PRNG (mulberry32) so a field is stable across rebuilds. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Bilinear height sample (world units) of a terrain at continuous local (x, z). */
export function sampleTerrainHeight(t: TerrainConfig, x: number, z: number): number {
  if (!t.heights.length) return 0;
  const n = t.subdivisions + 1;
  const u = clamp((x + t.size / 2) / t.size, 0, 1) * (n - 1);
  const v = clamp((z + t.size / 2) / t.size, 0, 1) * (n - 1);
  const i0 = Math.floor(u);
  const j0 = Math.floor(v);
  const i1 = Math.min(i0 + 1, n - 1);
  const j1 = Math.min(j0 + 1, n - 1);
  const tx = u - i0;
  const tz = v - j0;
  const at = (i: number, j: number) => t.heights[j * n + i] ?? 0;
  const top = at(i0, j0) * (1 - tx) + at(i1, j0) * tx;
  const bot = at(i0, j1) * (1 - tx) + at(i1, j1) * tx;
  return (top * (1 - tz) + bot * tz) * t.maxHeight;
}

/** A single tapered blade quad (2 triangles), pivot at the base, growing up +Y. */
function bladeVertexData(cfg: GrassConfig): VertexData {
  const w = cfg.bladeWidth;
  const h = cfg.bladeHeight;
  const tw = w * 0.15; // tip width
  const vd = new VertexData();
  vd.positions = [-w / 2, 0, 0, w / 2, 0, 0, -tw, h, 0, tw, h, 0];
  vd.indices = [0, 1, 2, 1, 3, 2];
  vd.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
  vd.uvs = [0, 0, 1, 0, 0, 1, 1, 1];
  return vd;
}

/** Build the grass field mesh for an entity. The returned mesh should be parented
 *  to the host so it tracks the host's transform (blade positions are in host-local
 *  space). Returns null when there's nothing to grow (zero blades). */
export function buildGrass(scene: Scene, host: AbstractMesh, e: Entity): Mesh | null {
  const cfg = { ...defaultGrass(), ...(e.mesh?.grass ?? {}) };
  const terrain = e.mesh?.kind === 'terrain' ? e.mesh.terrain ?? defaultTerrain() : null;

  // Scatter bounds + surface height, in the host's LOCAL space.
  let halfX: number;
  let halfZ: number;
  let baseX = 0;
  let baseZ = 0;
  let heightAt: (x: number, z: number) => number;
  if (terrain) {
    halfX = halfZ = terrain.size / 2;
    heightAt = (x, z) => sampleTerrainHeight(terrain, x, z);
  } else {
    const bb = host.getBoundingInfo().boundingBox;
    halfX = (bb.maximum.x - bb.minimum.x) / 2;
    halfZ = (bb.maximum.z - bb.minimum.z) / 2;
    baseX = (bb.maximum.x + bb.minimum.x) / 2;
    baseZ = (bb.maximum.z + bb.minimum.z) / 2;
    const top = bb.maximum.y;
    heightAt = () => top;
  }
  const area = halfX * 2 * (halfZ * 2);
  const count = bladeCountFor(cfg, area);
  if (count === 0) return null;

  const blade = new Mesh(`${e.id}_grass`, scene);
  bladeVertexData(cfg).applyToMesh(blade);
  const mat = buildFoliageMaterial(scene, `${e.id}_grassMat`);
  applyFoliageConfig(mat, cfg.color, {
    windStrength: cfg.windStrength,
    windSpeed: cfg.windSpeed,
    rimColor: cfg.rimColor,
    rimIntensity: cfg.rimIntensity,
  });
  // Blades are flat quads — show both faces so they read from any angle.
  mat.backFaceCulling = false;
  mat.twoSidedLighting = true;
  blade.material = mat;
  blade.layerMask = DEFAULT_LAYER;
  blade.isPickable = false;
  // The base mesh is a tiny quad; without this the whole field frustum-culls as one.
  blade.alwaysSelectAsActiveMesh = true;

  const rng = mulberry32(hashId(e.id));
  const matrices = new Float32Array(count * 16);
  const m = new Matrix();
  const scl = new Vector3();
  const pos = new Vector3();
  for (let k = 0; k < count; k++) {
    const x = baseX + (rng() * 2 - 1) * halfX;
    const z = baseZ + (rng() * 2 - 1) * halfZ;
    const s = 0.8 + rng() * 0.5; // per-blade size jitter
    scl.set(s, s, s);
    pos.set(x, heightAt(x, z), z);
    Matrix.ComposeToRef(scl, Quaternion.FromEulerAngles(0, rng() * Math.PI * 2, 0), pos, m);
    m.copyToArray(matrices, k * 16);
  }
  blade.thinInstanceSetBuffer('matrix', matrices, 16, true);
  blade.thinInstanceRefreshBoundingInfo(true);
  return blade;
}

/** A signature for the current grass+terrain state; the scene sync rebuilds the
 *  field only when this changes (not every sync). Null when there's no grass. */
export function grassKeyFor(e: Entity): string | null {
  if (!e.mesh?.grass) return null;
  const t = e.mesh.kind === 'terrain' ? e.mesh.terrain ?? defaultTerrain() : null;
  const tKey = t ? `${t.size}:${t.subdivisions}:${t.maxHeight}:${t.heights.length}` : 'box';
  return `${JSON.stringify(e.mesh.grass)}|${tKey}`;
}
