import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { CustomGeometry } from '@/types';

/** Build a mesh from baked custom geometry (CSG result / sculpt). */
export function buildCustomMesh(scene: Scene, id: string, geo: CustomGeometry): AbstractMesh {
  const mesh = new Mesh(id, scene);
  const vd = new VertexData();
  vd.positions = geo.positions;
  vd.indices = geo.indices;
  if (geo.uvs?.length) vd.uvs = geo.uvs;
  if (geo.normals.length) {
    vd.normals = geo.normals;
  } else {
    const normals: number[] = [];
    VertexData.ComputeNormals(geo.positions, geo.indices, normals);
    vd.normals = normals;
  }
  vd.applyToMesh(mesh, true);
  return mesh;
}

/** Read a Babylon mesh's geometry into a serializable CustomGeometry. */
export function toCustomGeometry(mesh: AbstractMesh): CustomGeometry {
  const positions = Array.from(mesh.getVerticesData('position') ?? []);
  const normals = Array.from(mesh.getVerticesData('normal') ?? []);
  const uvsRaw = mesh.getVerticesData('uv');
  const indices = Array.from(mesh.getIndices() ?? []);
  return { positions, indices, normals, uvs: uvsRaw ? Array.from(uvsRaw) : undefined };
}
