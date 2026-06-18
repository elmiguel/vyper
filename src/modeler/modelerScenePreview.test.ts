import { describe, it, expect } from 'vitest';
import { usesLitMaterial } from './modelerScenePreview';
import type { MaterialConfig } from '@/types';

const mat = (over: Partial<MaterialConfig> = {}): MaterialConfig => ({ shading: 'pbr', metallic: 0, roughness: 1, ...over });

describe('usesLitMaterial', () => {
  it('is flat (false) for a material-less mesh with lit preview off', () => {
    expect(usesLitMaterial(false, undefined)).toBe(false);
  });

  it('renders PBR whenever a material is assigned, regardless of the toggle', () => {
    expect(usesLitMaterial(false, mat())).toBe(true);
    expect(usesLitMaterial(false, mat({ baseColorMap: 'http://x/wood.jpg' }))).toBe(true);
  });

  it('honours the lit-preview toggle for a material-less mesh', () => {
    expect(usesLitMaterial(true, undefined)).toBe(true);
  });
});
