import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { CreateLineSystem } from '@babylonjs/core/Meshes/Builders/linesBuilder';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Node } from '@babylonjs/core/node';
import { EditableMesh, edgeKey, type ComponentMode } from './EditableMesh';

const VERT_COLOR = Color3.FromHexString('#6ea8ff');
const VERT_SEL = Color3.FromHexString('#ffcc44');
const EDGE_COLOR = new Color4(0.43, 0.66, 1, 0.9);
const EDGE_SEL = new Color4(1, 0.8, 0.27, 1);
const FACE_SEL = Color3.FromHexString('#ffcc44');

/**
 * Renders the Edit-Mode component overlays for an {@link EditableMesh}: vertices as a
 * point cloud, edges as a line system, and selected faces as a translucent highlight.
 * It owns its meshes on the given parent transform and rebuilds them whenever the mesh
 * or selection changes; {@link dispose} tears everything down.
 */
export class MeshEditOverlay {
  private verts?: Mesh;
  private selVerts?: Mesh;
  private edges?: LinesMesh;
  private selEdges?: LinesMesh;
  private faceHi?: Mesh;
  private readonly vmat: StandardMaterial;
  private readonly vselMat: StandardMaterial;
  private readonly fmat: StandardMaterial;

  constructor(private readonly scene: Scene, private readonly parent: Node) {
    this.vmat = pointMat(scene, 'em-vmat', VERT_COLOR, 8);
    this.vselMat = pointMat(scene, 'em-vselmat', VERT_SEL, 12);
    this.fmat = new StandardMaterial('em-fmat', scene);
    this.fmat.emissiveColor = FACE_SEL;
    this.fmat.alpha = 0.28;
    this.fmat.backFaceCulling = false;
    this.fmat.disableLighting = true;
  }

  /** Rebuild every overlay from the current mesh + selection (in `component` space). */
  rebuild(mesh: EditableMesh, component: ComponentMode, selection: Set<string>): void {
    this.rebuildVertices(mesh, component, selection);
    this.rebuildEdges(mesh, component, selection);
    this.rebuildFaces(mesh, component, selection);
  }

  private rebuildVertices(mesh: EditableMesh, component: ComponentMode, selection: Set<string>): void {
    this.verts?.dispose();
    this.selVerts?.dispose();
    const all = mesh.vertices;
    if (all.length === 0) return;
    this.verts = pointsMesh(this.scene, 'em-verts', this.parent, this.vmat, all);
    if (component === 'vertex' && selection.size) {
      const sel = [...selection].map((k) => all[Number(k)]).filter(Boolean);
      this.selVerts = pointsMesh(this.scene, 'em-selverts', this.parent, this.vselMat, sel);
    }
  }

  private rebuildEdges(mesh: EditableMesh, component: ComponentMode, selection: Set<string>): void {
    this.edges?.dispose();
    this.selEdges?.dispose();
    const edges = mesh.computeEdges();
    const lines: Vector3[][] = [];
    const colors: Color4[][] = [];
    for (const e of edges.values()) {
      lines.push([toV3(mesh.vertices[e.a]), toV3(mesh.vertices[e.b])]);
      colors.push([EDGE_COLOR, EDGE_COLOR]);
    }
    if (lines.length) {
      this.edges = CreateLineSystem('em-edges', { lines, colors }, this.scene);
      this.edges.parent = this.parent;
      this.edges.isPickable = false;
    }
    if (component === 'edge' && selection.size) {
      const sl: Vector3[][] = [];
      const sc: Color4[][] = [];
      for (const key of selection) {
        const e = edges.get(key);
        if (!e) continue;
        sl.push([toV3(mesh.vertices[e.a]), toV3(mesh.vertices[e.b])]);
        sc.push([EDGE_SEL, EDGE_SEL]);
      }
      if (sl.length) {
        this.selEdges = CreateLineSystem('em-seledges', { lines: sl, colors: sc }, this.scene);
        this.selEdges.parent = this.parent;
        this.selEdges.isPickable = false;
      }
    }
  }

  private rebuildFaces(mesh: EditableMesh, component: ComponentMode, selection: Set<string>): void {
    this.faceHi?.dispose();
    if (component !== 'face' || selection.size === 0) return;
    const positions: number[] = [];
    const indices: number[] = [];
    for (const key of selection) {
      const loop = mesh.faces[Number(key)];
      if (!loop) continue;
      const base = positions.length / 3;
      for (const vi of loop) {
        const v = mesh.vertices[vi];
        positions.push(v.x, v.y, v.z);
      }
      for (let i = 1; i < loop.length - 1; i++) indices.push(base, base + i, base + i + 1);
    }
    if (indices.length === 0) return;
    const m = new Mesh('em-facehi', this.scene);
    const vd = new VertexData();
    vd.positions = positions;
    vd.indices = indices;
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    vd.normals = normals;
    vd.applyToMesh(m);
    m.parent = this.parent;
    m.material = this.fmat;
    m.isPickable = false;
    // Lift slightly toward the camera-independent normal to avoid z-fighting.
    m.renderingGroupId = 1;
    this.faceHi = m;
  }

  dispose(): void {
    this.verts?.dispose();
    this.selVerts?.dispose();
    this.edges?.dispose();
    this.selEdges?.dispose();
    this.faceHi?.dispose();
    this.vmat.dispose();
    this.vselMat.dispose();
    this.fmat.dispose();
  }
}

function toV3(v: { x: number; y: number; z: number }): Vector3 {
  return new Vector3(v.x, v.y, v.z);
}

function pointMat(scene: Scene, name: string, color: Color3, size: number): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.emissiveColor = color;
  m.disableLighting = true;
  m.pointsCloud = true;
  m.pointSize = size;
  return m;
}

function pointsMesh(
  scene: Scene,
  name: string,
  parent: Node,
  mat: StandardMaterial,
  verts: Array<{ x: number; y: number; z: number }>,
): Mesh {
  const m = new Mesh(name, scene);
  const vd = new VertexData();
  const positions: number[] = [];
  for (const v of verts) positions.push(v.x, v.y, v.z);
  vd.positions = positions;
  vd.indices = []; // point cloud: no triangles
  vd.applyToMesh(m);
  m.material = mat;
  m.parent = parent;
  m.isPickable = false;
  m.renderingGroupId = 1; // draw over the surface
  return m;
}

/** The vertex indices implied by a component selection (for transforms/merge). */
export function selectedVertexIndices(mesh: EditableMesh, component: ComponentMode, selection: Set<string>): number[] {
  const out = new Set<number>();
  if (component === 'vertex') {
    for (const k of selection) out.add(Number(k));
  } else if (component === 'edge') {
    const edges = mesh.computeEdges();
    for (const k of selection) {
      const e = edges.get(k);
      if (e) {
        out.add(e.a);
        out.add(e.b);
      }
    }
  } else {
    for (const k of selection) for (const vi of mesh.faces[Number(k)] ?? []) out.add(vi);
  }
  return [...out];
}

/** Reusable key for the edge between two vertices (re-export for callers). */
export { edgeKey };
