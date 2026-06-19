import { describe, it, expect } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Constants } from '@babylonjs/core/Engines/constants';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { buildSpawnerBillboard } from './spawnerBillboard';
import { EDITOR_LAYER } from './editorObjects';

describe('buildSpawnerBillboard', () => {
  it('builds an editor-only, camera-facing, always-on-top icon named for its entity', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);

    const mesh = buildSpawnerBillboard(scene, 'spawner1');
    expect(mesh.name).toBe('spawner1'); // entity id → picking + gizmo attach work
    expect(mesh.layerMask).toBe(EDITOR_LAYER); // editor camera only, never the game view
    expect(mesh.billboardMode).toBe(Mesh.BILLBOARDMODE_ALL); // always faces the camera
    expect(mesh.renderingGroupId).toBeGreaterThan(0); // drawn after normal geometry
    expect(mesh.isPickable).toBe(true);

    // Always-on-top: ignores the depth buffer so the selected object can't occlude it.
    const mat = mesh.material as StandardMaterial;
    expect(mat.depthFunction).toBe(Constants.ALWAYS);
    expect(mat.disableDepthWrite).toBe(true);
    expect(mat.disableLighting).toBe(true); // unlit, reads the icon texture's own colours

    scene.dispose();
    engine.dispose();
  });
});
