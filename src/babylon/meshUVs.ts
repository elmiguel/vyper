/**
 * Box / tri-planar UV generation for geometry that ships without UVs (the half-edge kernel and
 * CSG produce none). Each vertex is projected onto the world plane perpendicular to the dominant
 * axis of its normal, so axis-aligned faces (cubes, planes, extrusions) get sensible, world-scaled
 * texture mapping. `scale` is texture tiles per world unit. Not a true unwrap — enough to show
 * detail. Pure (positions/normals → uvs); lives in babylon/ so the renderer never reaches into the
 * kernel for it.
 */
export function computeBoxUVs(positions: number[], normals: number[], scale = 1): number[] {
  const uvs = new Array<number>((positions.length / 3) * 2);
  for (let i = 0, u = 0; i < positions.length; i += 3, u += 2) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    const nx = Math.abs(normals[i] ?? 0), ny = Math.abs(normals[i + 1] ?? 0), nz = Math.abs(normals[i + 2] ?? 0);
    let uu: number, vv: number;
    if (nx >= ny && nx >= nz) { uu = z; vv = y; }        // X-facing → project ZY
    else if (ny >= nx && ny >= nz) { uu = x; vv = z; }   // Y-facing → project XZ
    else { uu = x; vv = y; }                              // Z-facing → project XY
    uvs[u] = uu * scale;
    uvs[u + 1] = vv * scale;
  }
  return uvs;
}
