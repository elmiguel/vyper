import { describe, it, expect } from 'vitest';
import { computeBoxUVs } from './modelerSceneGeom';

describe('computeBoxUVs', () => {
  it('emits one uv pair per vertex', () => {
    const positions = [0, 0, 0, 1, 0, 0, 0, 0, 1];
    const normals = [0, 1, 0, 0, 1, 0, 0, 1, 0];
    expect(computeBoxUVs(positions, normals)).toHaveLength((positions.length / 3) * 2);
  });

  it('projects a Y-facing (ground) face onto the XZ plane', () => {
    // normal points +Y → uv = (x, z)
    const uvs = computeBoxUVs([2, 0, 5], [0, 1, 0]);
    expect(uvs).toEqual([2, 5]);
  });

  it('projects a Z-facing wall onto the XY plane', () => {
    const uvs = computeBoxUVs([3, 4, 0], [0, 0, 1]);
    expect(uvs).toEqual([3, 4]);
  });

  it('projects an X-facing wall onto the ZY plane', () => {
    const uvs = computeBoxUVs([0, 4, 3], [1, 0, 0]);
    expect(uvs).toEqual([3, 4]);
  });

  it('applies the tile scale', () => {
    expect(computeBoxUVs([2, 0, 2], [0, 1, 0], 0.5)).toEqual([1, 1]);
  });
});
