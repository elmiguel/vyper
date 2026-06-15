import { Scene } from '@babylonjs/core/scene';
import { Vector3, Color3 } from '@babylonjs/core/Maths/math';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Light } from '@babylonjs/core/Lights/light';
import '@babylonjs/core/Meshes/Builders/linesBuilder';
import '@babylonjs/core/Meshes/Builders/discBuilder';
import type { Entity, GameMode } from '@/types';
import { GAME_CAMERA_ID, EDITOR_LAYER, DEFAULT_LAYER } from './editorObjects';

export const DEG = Math.PI / 180;
export const CAM_HELPER_COLOR = '#22d3ee';
export const DOUBLE_SIDED = 2; // Mesh.DOUBLESIDE — flat 2D shapes are visible from either side.

export function buildMesh(scene: Scene, e: Entity): AbstractMesh {
  const kind = e.mesh!.kind;
  switch (kind) {
    case 'sphere':
      return MeshBuilder.CreateSphere(e.id, { diameter: 1, segments: 24 }, scene);
    case 'ground':
      return MeshBuilder.CreateGround(e.id, { width: 12, height: 12, subdivisions: 2 }, scene);
    case 'plane':
      return MeshBuilder.CreatePlane(e.id, { size: 2, sideOrientation: DOUBLE_SIDED }, scene);
    case 'cylinder':
      return MeshBuilder.CreateCylinder(e.id, { height: 1.4, diameter: 1 }, scene);
    case 'cone':
      return MeshBuilder.CreateCylinder(e.id, { height: 1.4, diameterTop: 0, diameterBottom: 1 }, scene);
    // ---- 2D shapes: flat, lying in the XY plane ----
    case 'square':
      return MeshBuilder.CreatePlane(e.id, { size: 1, sideOrientation: DOUBLE_SIDED }, scene);
    case 'circle':
      return MeshBuilder.CreateDisc(e.id, { radius: 0.5, tessellation: 48, sideOrientation: DOUBLE_SIDED }, scene);
    case 'triangle':
      return MeshBuilder.CreateDisc(e.id, { radius: 0.6, tessellation: 3, sideOrientation: DOUBLE_SIDED }, scene);
    case 'box':
    default:
      return MeshBuilder.CreateBox(e.id, { size: 1 }, scene);
  }
}

export function createGrid(scene: Scene, mode: GameMode): AbstractMesh {
  const grid = MeshBuilder.CreateGround('__grid', { width: 40, height: 40, subdivisions: 40 }, scene);
  const mat = new StandardMaterial('__gridMat', scene);
  mat.wireframe = true;
  mat.emissiveColor = new Color3(0.18, 0.12, 0.34);
  mat.disableLighting = true;
  grid.material = mat;
  grid.isPickable = false;
  if (mode === '2d') {
    // Stand the grid up into the XY plane (it's built flat in XZ) so it faces the 2D camera.
    grid.rotation.x = -Math.PI / 2;
    grid.position.z = 0.001;
  } else {
    grid.position.y = -0.001;
  }
  grid.layerMask = EDITOR_LAYER; // editor-only — never rendered by the game camera
  return grid;
}

/** A camera helper for the editor view. 3D: a camera-shaped rig. 2D: a view-frame rectangle. */
export function createGameCameraHelper(scene: Scene, mode: GameMode, orthoSize: number): Mesh {
  if (mode === '2d') return createGameCameraHelper2D(scene, orthoSize);
  const body = MeshBuilder.CreateBox(GAME_CAMERA_ID, { width: 0.7, height: 0.5, depth: 0.9 }, scene);
  const lens = MeshBuilder.CreateCylinder(
    `${GAME_CAMERA_ID}:lens`,
    { height: 0.45, diameterTop: 0.6, diameterBottom: 0.28, tessellation: 20 },
    scene,
  );
  lens.parent = body;
  lens.rotation.x = Math.PI / 2;
  lens.position.z = 0.62;

  // Wireframe frustum opening toward +z (the camera's forward) for facing feedback.
  const f = 2.2, w = 1.1, h = 0.7;
  const apex = new Vector3(0, 0, 0);
  const c = [new Vector3(-w, h, f), new Vector3(w, h, f), new Vector3(w, -h, f), new Vector3(-w, -h, f)];
  const lines = [
    [apex, c[0]], [apex, c[1]], [apex, c[2]], [apex, c[3]],
    [c[0], c[1]], [c[1], c[2]], [c[2], c[3]], [c[3], c[0]],
  ];
  const frustum = MeshBuilder.CreateLineSystem(`${GAME_CAMERA_ID}:frustum`, { lines }, scene) as LinesMesh;
  frustum.color = Color3.FromHexString(CAM_HELPER_COLOR);
  frustum.parent = body;
  frustum.isPickable = false;

  const mat = new StandardMaterial(`${GAME_CAMERA_ID}:mat`, scene);
  mat.emissiveColor = Color3.FromHexString(CAM_HELPER_COLOR);
  mat.diffuseColor = Color3.FromHexString('#0a2730');
  mat.specularColor = new Color3(0, 0, 0);
  body.material = mat;
  lens.material = mat;

  for (const m of [body, lens, frustum]) m.layerMask = EDITOR_LAYER;
  body.isPickable = true;
  lens.isPickable = true;
  return body;
}

/** 2D camera helper: a rectangle showing the orthographic view bounds in the XY plane. */
function createGameCameraHelper2D(scene: Scene, orthoSize: number): Mesh {
  const halfH = orthoSize;
  const halfW = halfH * (16 / 9);
  // A faint, pickable fill so the camera is selectable by clicking inside its frame.
  const body = MeshBuilder.CreatePlane(GAME_CAMERA_ID, { width: halfW * 2, height: halfH * 2, sideOrientation: DOUBLE_SIDED }, scene);
  const fill = new StandardMaterial(`${GAME_CAMERA_ID}:mat`, scene);
  fill.emissiveColor = Color3.FromHexString(CAM_HELPER_COLOR);
  fill.disableLighting = true;
  fill.alpha = 0.06;
  body.material = fill;

  // Bright border outline.
  const c = [new Vector3(-halfW, halfH, 0), new Vector3(halfW, halfH, 0), new Vector3(halfW, -halfH, 0), new Vector3(-halfW, -halfH, 0)];
  const frame = MeshBuilder.CreateLineSystem(
    `${GAME_CAMERA_ID}:frame`,
    { lines: [[c[0], c[1]], [c[1], c[2]], [c[2], c[3]], [c[3], c[0]]] },
    scene,
  ) as LinesMesh;
  frame.color = Color3.FromHexString(CAM_HELPER_COLOR);
  frame.parent = body;
  frame.isPickable = false;

  for (const m of [body, frame]) m.layerMask = EDITOR_LAYER;
  body.isPickable = true;
  return body;
}

export function buildLight(scene: Scene, e: Entity): Light {
  const p = e.transform.position;
  const kind = e.light!.kind;
  if (kind === 'hemispheric') return new HemisphericLight(e.id, new Vector3(0, 1, 0), scene);
  if (kind === 'point') return new PointLight(e.id, new Vector3(p.x, p.y, p.z), scene);
  return new DirectionalLight(e.id, new Vector3(-0.5, -1, -0.3), scene);
}

export function applyLightTransform(light: Light, e: Entity) {
  const p = e.transform.position;
  if (light instanceof PointLight) light.position.set(p.x, p.y, p.z);
  if (light instanceof DirectionalLight) {
    const r = e.transform.rotation;
    light.direction = new Vector3(
      Math.sin(r.y * DEG) * Math.cos(r.x * DEG),
      -Math.sin(r.x * DEG) - 0.4,
      Math.cos(r.y * DEG),
    ).normalize();
  }
}

export function applyTransform(mesh: AbstractMesh, t: Entity['transform']) {
  mesh.position.set(t.position.x, t.position.y, t.position.z);
  // Clear any quaternion the rotation gizmo set so euler rotation stays authoritative.
  mesh.rotationQuaternion = null;
  mesh.rotation.set(t.rotation.x * DEG, t.rotation.y * DEG, t.rotation.z * DEG);
  mesh.scaling.set(t.scale.x, t.scale.y, t.scale.z);
}

// Re-export the layer constants so SceneManager can import scene-building bits from one module.
export { GAME_CAMERA_ID, EDITOR_LAYER, DEFAULT_LAYER };
