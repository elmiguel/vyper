import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { TerrainConfig } from '@/types';
import { gridSize, flatHeights } from './terrainBrush';

/**
 * Build an updatable ground mesh for a terrain entity and displace it by the
 * config's heightfield. The heightfield is "z-up natural" (row index increases
 * with +z); Babylon's `CreateGround` lays rows out with +z first, so the row is
 * flipped here when writing vertex Y — keeping `terrainBrush` free of that detail.
 */
export function buildTerrainMesh(scene: Scene, id: string, t: TerrainConfig): Mesh {
  const ground = MeshBuilder.CreateGround(
    id,
    { width: t.size, height: t.size, subdivisions: t.subdivisions, updatable: true },
    scene,
  );
  applyHeightsToMesh(ground, t);
  return ground;
}

/** Push a terrain config's heightfield onto an existing updatable ground mesh. */
export function applyHeightsToMesh(mesh: Mesh, t: TerrainConfig): void {
  const n = gridSize(t.subdivisions);
  const heights = t.heights.length === n * n ? t.heights : flatHeights(t.subdivisions);
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (!positions) return;

  for (let j = 0; j < n; j++) {
    const meshRow = n - 1 - j; // CreateGround emits +z rows first
    for (let i = 0; i < n; i++) {
      positions[(meshRow * n + i) * 3 + 1] = heights[j * n + i] * t.maxHeight;
    }
  }
  mesh.updateVerticesData(VertexBuffer.PositionKind, positions);

  const indices = mesh.getIndices();
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind) ?? new Float32Array(positions.length);
  if (indices) {
    VertexData.ComputeNormals(positions, indices, normals);
    mesh.updateVerticesData(VertexBuffer.NormalKind, normals);
  }
  mesh.refreshBoundingInfo();
}
