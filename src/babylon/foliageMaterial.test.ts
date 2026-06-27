import { describe, it, expect } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { buildFoliageMaterial, applyFoliageConfig } from './foliageMaterial';

describe('foliage material', () => {
  it('builds, configures, and prepares without throwing', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    new FreeCamera('c', new Vector3(0, 0, -5), scene);
    new HemisphericLight('h', new Vector3(0, 1, 0), scene);
    const mesh = MeshBuilder.CreateBox('b', { size: 1 }, scene);

    expect(() => {
      const mat = buildFoliageMaterial(scene, 'foliage');
      applyFoliageConfig(mat, '#3fa54a', { windStrength: 0.2, windSpeed: 2, rimColor: '#7dff8a', rimIntensity: 0.6 });
      mesh.material = mat;
      // Forces the plugin's getUniforms/getCustomCode/prepareDefines/bindForSubMesh
      // path to execute (shader compile is a no-op under NullEngine, but the JS
      // wiring runs — this is what was breaking scene sync in the browser).
      const sub = mesh.subMeshes[0];
      mat.isReadyForSubMesh(mesh, sub);
      scene.render();
    }).not.toThrow();

    scene.dispose();
    engine.dispose();
  });
});
