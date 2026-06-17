import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Asset } from '@/types';

// --- Babylon is WebGL-backed and can't run in jsdom; mock the bits we touch. ---
const fakeVec = (x: number, y: number, z: number) => ({
  x, y, z,
  add: (o: { x: number; y: number; z: number }) => fakeVec(x + o.x, y + o.y, z + o.z),
  subtract: (o: { x: number; y: number; z: number }) => fakeVec(x - o.x, y - o.y, z - o.z),
  scale: (s: number) => fakeVec(x * s, y * s, z * s),
  length: () => Math.hypot(x, y, z),
});

vi.mock('@/babylon/loaders', () => ({}));
vi.mock('@babylonjs/core/Engines/engine', () => ({
  Engine: class { runRenderLoop() {} stopRenderLoop() {} resize() {} dispose() {} },
}));
vi.mock('@babylonjs/core/scene', () => ({
  Scene: class {
    clearColor = null;
    dispose() {}
    getWorldExtends() { return { min: fakeVec(-1, -1, -1), max: fakeVec(1, 1, 1) }; }
  },
}));
vi.mock('@babylonjs/core/Cameras/arcRotateCamera', () => ({
  ArcRotateCamera: class { wheelDeltaPercentage = 0; radius = 0; lowerRadiusLimit = 0; upperRadiusLimit = 0; attachControl() {} setTarget() {} },
}));
vi.mock('@babylonjs/core/Lights/hemisphericLight', () => ({
  HemisphericLight: class { intensity = 0; groundColor = null; },
}));
vi.mock('@babylonjs/core/Meshes/transformNode', () => ({
  TransformNode: class {
    position = { set() {} };
    rotation = { set() {} };
    scaling = { set() {} };
  },
}));
vi.mock('@babylonjs/core/Maths/math', () => ({
  Vector3: class { constructor(public x = 0, public y = 0, public z = 0) {} static Zero() { return new this(0, 0, 0); } },
  Color3: class { constructor(public r = 0, public g = 0, public b = 0) {} },
}));
vi.mock('@babylonjs/core/Maths/math.color', () => ({ Color4: class { constructor(public r = 0, public g = 0, public b = 0, public a = 1) {} } }));

const animGroups: { name: string }[] = [];
vi.mock('@babylonjs/core/Loading/sceneLoader', () => ({
  SceneLoader: { ImportMeshAsync: vi.fn(async () => ({ meshes: [], animationGroups: animGroups.map((g) => ({ ...g, stop() {}, play() {}, pause() {} })) })) },
}));

import { ModelPreview } from './ModelPreview';

const asset: Asset = { id: 'chicken', name: 'chicken', type: 'model', source: 'builtin', format: 'obj', modelFile: 'chicken_001.obj', textures: [] };

beforeEach(() => {
  animGroups.length = 0;
  // jsdom lacks ResizeObserver.
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});

describe('ModelPreview', () => {
  it('reports a static format (OBJ) has no animations once loaded', async () => {
    render(<ModelPreview asset={asset} />);
    await waitFor(() => expect(screen.getByText(/no animations/i)).toBeInTheDocument());
    expect(screen.getByText(/OBJ is a static format/i)).toBeInTheDocument();
  });

  it('offers playback when the model has animation groups', async () => {
    animGroups.push({ name: 'Walk' });
    render(<ModelPreview asset={asset} />);
    const btn = await screen.findByRole('button', { name: /Walk/ });
    fireEvent.click(btn); // play → pause toggle should not throw
    expect(btn).toBeInTheDocument();
  });
});
