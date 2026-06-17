import type { Scene } from '@babylonjs/core/scene';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { CreateLineSystem } from '@babylonjs/core/Meshes/Builders/linesBuilder';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { RotationGizmo } from '@babylonjs/core/Gizmos/rotationGizmo';
import { UtilityLayerRenderer } from '@babylonjs/core/Rendering/utilityLayerRenderer';
import type { CustomGeometry, RigComponent, RigSkeleton, SkinData, Vec3 } from '@/types';
import { EditableMesh } from './editmesh/EditableMesh';
import { autoWeights, linearBlendSkin, poseBones, quatFromEuler } from './editmesh/rig';
import { toCustomGeometry } from './customMesh';

const BONE_COLOR = new Color4(0.55, 0.78, 1, 1);
const BONE_SEL = new Color4(1, 0.8, 0.27, 1);

/** What the controller commits back when rigging changes (→ store.commitRig). */
export interface RigCommit {
  skeleton: RigSkeleton;
  skin: SkinData;
  pose: Record<string, Vec3>;
}

/**
 * Drives rigging + skeletal posing for one entity's mesh. It builds a welded working
 * mesh from the entity geometry, displays the skeleton, lets you pose bones with a
 * rotation gizmo, computes distance-based skin weights, and shows a live linear-blend-
 * skinned preview (all via the pure `rig` core). Animation scrubbing feeds in through
 * {@link applyPose}. Mirrors MeshEditController's lifecycle/commit pattern.
 */
export class RigController {
  private active = false;
  private entityId?: string;
  private edit?: EditableMesh;
  private restPositions: number[] = [];
  private indices: number[] = [];
  private skeleton: RigSkeleton = { bones: [] };
  private skin: SkinData = { indices: [], weights: [] };
  private pose: Record<string, Vec3> = {};
  private selectedBone: string | null = null;

  private root?: TransformNode;
  private preview?: Mesh;
  private previewMat?: StandardMaterial;
  private boneLines?: LinesMesh;
  private gizmo?: RotationGizmo;
  private gizmoNode?: TransformNode;
  private onCommit?: (entityId: string, commit: RigCommit) => void;
  private onPoseChange?: (boneId: string, euler: Vec3) => void;

  constructor(
    private readonly scene: Scene,
    private readonly camera: ArcRotateCamera,
    private readonly getMesh: (entityId: string) => AbstractMesh | undefined,
  ) {}

  isActive(): boolean {
    return this.active;
  }
  setOnCommit(cb: (entityId: string, commit: RigCommit) => void): void {
    this.onCommit = cb;
  }
  /** Fired when a bone is posed via the gizmo (so the timeline can key it). */
  setOnPoseChange(cb: (boneId: string, euler: Vec3) => void): void {
    this.onPoseChange = cb;
  }

  setTarget(active: boolean, entityId: string | null, geo?: CustomGeometry | null, rig?: RigComponent | null): void {
    if (active && entityId && this.getMesh(entityId)) this.begin(entityId, geo ?? undefined, rig ?? undefined);
    else this.end();
  }

  private begin(entityId: string, geo?: CustomGeometry, rig?: RigComponent): void {
    this.end();
    const src = this.getMesh(entityId);
    if (!src) return;
    this.edit = EditableMesh.fromGeometry(geo ?? toCustomGeometry(src));
    this.restPositions = this.edit.vertices.flatMap((v) => [v.x, v.y, v.z]);
    this.indices = this.edit.triangulate().flat();
    this.skeleton = rig?.skeleton ?? { bones: [] };
    this.pose = { ...(rig?.pose ?? {}) };
    this.skin = src && (src as Mesh).getVerticesData ? this.loadOrEmptySkin() : { indices: [], weights: [] };
    this.entityId = entityId;
    this.active = true;

    this.root = new TransformNode('rig-root', this.scene);
    this.root.position.copyFrom(src.position);
    this.root.rotationQuaternion = src.rotationQuaternion?.clone() ?? null;
    if (!this.root.rotationQuaternion) this.root.rotation.copyFrom(src.rotation);
    this.root.scaling.copyFrom(src.scaling);
    src.setEnabled(false);

    this.previewMat = new StandardMaterial('rig-preview', this.scene);
    this.previewMat.diffuseColor = Color3.FromHexString('#8a93a6');
    this.previewMat.backFaceCulling = false;
    this.rebuild();
  }

  private loadOrEmptySkin(): SkinData {
    return { indices: [], weights: [] };
  }

  private end(): void {
    if (this.active && this.entityId) {
      this.commit();
      this.getMesh(this.entityId)?.setEnabled(true);
    }
    this.gizmo?.dispose();
    this.boneLines?.dispose();
    this.preview?.dispose();
    this.previewMat?.dispose();
    this.gizmoNode?.dispose();
    this.root?.dispose();
    this.gizmo = undefined;
    this.boneLines = undefined;
    this.preview = undefined;
    this.previewMat = undefined;
    this.gizmoNode = undefined;
    this.root = undefined;
    this.edit = undefined;
    this.active = false;
    this.entityId = undefined;
    this.selectedBone = null;
  }

  /** Append a bone, chaining upward from the selected bone's tail (or the origin). */
  addBone(): void {
    if (!this.edit) return;
    const parent = this.skeleton.bones.find((b) => b.id === this.selectedBone) ?? null;
    const head: Vec3 = parent ? { ...parent.tail } : { x: 0, y: 0, z: 0 };
    const tail: Vec3 = { x: head.x, y: head.y + 1, z: head.z };
    const id = `bone-${this.skeleton.bones.length}-${Math.floor(this.restPositions.length)}`;
    this.skeleton = { bones: [...this.skeleton.bones, { id, name: `Bone ${this.skeleton.bones.length + 1}`, parentId: parent?.id ?? null, head, tail }] };
    this.selectedBone = id;
    this.rebuild();
    this.commit();
  }

  selectBone(id: string | null): void {
    this.selectedBone = id;
    this.attachGizmo();
    this.rebuildBones();
  }

  /** Bind distance-based skin weights from the current rest mesh + skeleton. */
  autoWeight(): void {
    if (this.skeleton.bones.length === 0) return;
    this.skin = autoWeights(this.restPositions, this.skeleton);
    this.rebuild();
    this.commit();
  }

  /** Apply a full pose (Euler degrees per bone) — used by animation scrubbing. */
  applyPose(pose: Record<string, Vec3>): void {
    this.pose = { ...pose };
    this.rebuildPreview();
  }

  private localRotMap(): Record<string, ReturnType<typeof quatFromEuler>> {
    const out: Record<string, ReturnType<typeof quatFromEuler>> = {};
    for (const [id, e] of Object.entries(this.pose)) out[id] = quatFromEuler(e.x, e.y, e.z);
    return out;
  }

  private skinnedPositions(): number[] {
    if (this.skin.weights.length === 0 || this.skeleton.bones.length === 0) return this.restPositions;
    const posed = poseBones(this.skeleton, this.localRotMap());
    return linearBlendSkin(this.restPositions, this.skin, this.skeleton, posed);
  }

  private rebuild(): void {
    this.rebuildPreview();
    this.rebuildBones();
    this.attachGizmo();
  }

  private rebuildPreview(): void {
    if (!this.root) return;
    this.preview?.dispose();
    const mesh = new Mesh('rig-preview', this.scene);
    const positions = this.skinnedPositions();
    const vd = new VertexData();
    vd.positions = positions;
    vd.indices = this.indices;
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, this.indices, normals);
    vd.normals = normals;
    vd.applyToMesh(mesh);
    mesh.material = this.previewMat!;
    mesh.parent = this.root;
    this.preview = mesh;
  }

  private rebuildBones(): void {
    if (!this.root) return;
    this.boneLines?.dispose();
    if (this.skeleton.bones.length === 0) return;
    const posed = poseBones(this.skeleton, this.localRotMap());
    const lines: Vector3[][] = [];
    const colors: Color4[][] = [];
    for (const b of this.skeleton.bones) {
      const p = posed.get(b.id)!;
      // Posed tail = posed head + worldRot · (tail − head).
      const off = { x: b.tail.x - b.head.x, y: b.tail.y - b.head.y, z: b.tail.z - b.head.z };
      const ro = rotate(p.worldRot, off);
      const tail = new Vector3(p.head.x + ro.x, p.head.y + ro.y, p.head.z + ro.z);
      lines.push([new Vector3(p.head.x, p.head.y, p.head.z), tail]);
      const c = b.id === this.selectedBone ? BONE_SEL : BONE_COLOR;
      colors.push([c, c]);
    }
    this.boneLines = CreateLineSystem('rig-bones', { lines, colors }, this.scene);
    this.boneLines.parent = this.root;
    this.boneLines.isPickable = false;
    this.boneLines.renderingGroupId = 1;
  }

  private attachGizmo(): void {
    const bone = this.skeleton.bones.find((b) => b.id === this.selectedBone);
    if (!bone) {
      if (this.gizmo) this.gizmo.attachedNode = null;
      return;
    }
    if (!this.gizmo) {
      const layer = UtilityLayerRenderer.DefaultUtilityLayer;
      this.gizmoNode = new TransformNode('rig-gizmo', this.scene);
      if (this.root) this.gizmoNode.parent = this.root;
      this.gizmo = new RotationGizmo(layer);
      this.gizmo.onDragEndObservable.add(() => this.readGizmoPose());
    }
    const posed = poseBones(this.skeleton, this.localRotMap()).get(bone.id)!;
    this.gizmoNode!.position.set(posed.head.x, posed.head.y, posed.head.z);
    this.gizmoNode!.rotationQuaternion = null;
    this.gizmoNode!.rotation.set(0, 0, 0);
    this.gizmo!.attachedNode = this.gizmoNode!;
  }

  private readGizmoPose(): void {
    if (!this.gizmoNode || !this.selectedBone) return;
    const e = this.gizmoNode.rotationQuaternion ? this.gizmoNode.rotationQuaternion.toEulerAngles() : this.gizmoNode.rotation;
    const deg: Vec3 = { x: (e.x * 180) / Math.PI, y: (e.y * 180) / Math.PI, z: (e.z * 180) / Math.PI };
    const prev = this.pose[this.selectedBone] ?? { x: 0, y: 0, z: 0 };
    const next = { x: prev.x + deg.x, y: prev.y + deg.y, z: prev.z + deg.z };
    this.pose = { ...this.pose, [this.selectedBone]: next };
    this.gizmoNode.rotation.set(0, 0, 0);
    this.gizmoNode.rotationQuaternion = null;
    this.rebuildPreview();
    this.rebuildBones();
    this.onPoseChange?.(this.selectedBone, next);
    this.commit();
  }

  commit(): void {
    if (this.active && this.entityId) {
      this.onCommit?.(this.entityId, { skeleton: this.skeleton, skin: this.skin, pose: this.pose });
    }
  }
}

function rotate(q: { x: number; y: number; z: number; w: number }, v: Vec3): Vec3 {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}
