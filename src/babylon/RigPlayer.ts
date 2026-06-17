import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { AnimClip, RigSkeleton, SkinData } from '@/types';
import { linearBlendSkin, poseBones, quatFromEuler } from './editmesh/rig';
import { sampleClipEuler } from './editmesh/animTimeline';

/** A request to play a skeletal clip on an entity at runtime (CPU linear-blend skinning). */
export interface ClipPlayRequest {
  clip: AnimClip;
  skeleton: RigSkeleton;
  skin: SkinData;
  /** Welded rest positions the skin weights index into (mesh.custom.polyVerts). */
  restPositions: number[];
  /** Polygon face loops to triangulate for the skinned render mesh. */
  polygons: number[][];
  loop: boolean;
}

interface Entry extends ClipPlayRequest {
  indices: number[];
  mesh: Mesh;
  startMs: number;
}

/**
 * Runtime skeletal-animation playback. For each playing entity it shows a welded
 * skinned mesh (hiding the original), and every frame samples the clip, poses the
 * skeleton (FK), and linear-blend-skins the rest positions onto the mesh — all via the
 * pure `rig`/`animTimeline` cores. CPU skinning is fine at editor/indie mesh scale and
 * keeps one tested code path shared with the editor preview.
 */
export class RigPlayer {
  private entries = new Map<string, Entry>();

  constructor(private readonly scene: Scene, private readonly getTracked: (id: string) => AbstractMesh | undefined) {}

  start(entityId: string, req: ClipPlayRequest, nowMs: number): void {
    this.stop(entityId);
    const src = this.getTracked(entityId);
    if (!src) return;
    const indices = triangulate(req.polygons);
    const mesh = new Mesh(`rigplay-${entityId}`, this.scene);
    const vd = new VertexData();
    vd.positions = req.restPositions.slice();
    vd.indices = indices;
    const normals: number[] = [];
    VertexData.ComputeNormals(req.restPositions, indices, normals);
    vd.normals = normals;
    vd.applyToMesh(mesh, true);
    mesh.material = (src as Mesh).material;
    mesh.position.copyFrom(src.position);
    mesh.rotationQuaternion = src.rotationQuaternion?.clone() ?? null;
    if (!mesh.rotationQuaternion) mesh.rotation.copyFrom(src.rotation);
    mesh.scaling.copyFrom(src.scaling);
    src.setEnabled(false);
    this.entries.set(entityId, { ...req, indices, mesh, startMs: nowMs });
  }

  stop(entityId: string): void {
    const e = this.entries.get(entityId);
    if (!e) return;
    e.mesh.dispose();
    this.getTracked(entityId)?.setEnabled(true);
    this.entries.delete(entityId);
  }

  clear(): void {
    for (const id of [...this.entries.keys()]) this.stop(id);
  }

  /** Advance every playing clip to `nowMs` and update its skinned mesh in place. */
  tick(nowMs: number): void {
    for (const [, e] of this.entries) {
      const dur = e.clip.duration || 1;
      let t = (nowMs - e.startMs) / 1000;
      t = e.loop ? t % dur : Math.min(t, dur);
      const euler = sampleClipEuler(e.clip, t);
      const localRot: Record<string, ReturnType<typeof quatFromEuler>> = {};
      for (const [id, ev] of Object.entries(euler)) localRot[id] = quatFromEuler(ev.x, ev.y, ev.z);
      const posed = poseBones(e.skeleton, localRot);
      const positions = linearBlendSkin(e.restPositions, e.skin, e.skeleton, posed);
      e.mesh.updateVerticesData('position', positions);
      const normals: number[] = [];
      VertexData.ComputeNormals(positions, e.indices, normals);
      e.mesh.updateVerticesData('normal', normals);
    }
  }

  get active(): boolean {
    return this.entries.size > 0;
  }
}

function triangulate(polygons: number[][]): number[] {
  const indices: number[] = [];
  for (const loop of polygons) {
    for (let i = 1; i < loop.length - 1; i++) indices.push(loop[0], loop[i], loop[i + 1]);
  }
  return indices;
}
