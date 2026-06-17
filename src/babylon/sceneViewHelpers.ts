import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { UtilityLayerRenderer } from '@babylonjs/core/Rendering/utilityLayerRenderer';
import type { HighlightLayer } from '@babylonjs/core/Layers/highlightLayer';
import type { GameMode, Vec3 } from '@/types';
import { isCameraHelperMesh } from './meshPicking';

const RAD = 180 / Math.PI;

/** A transform read back off the gizmo, tagged by what it drives. */
export type GizmoTransform =
  | { kind: 'camera'; position: Vec3; rotation: Vec3 }
  | { kind: 'entity'; position: Vec3; rotation: Vec3; scale: Vec3 };

/** The minimal mesh shape {@link readGizmoTransform} needs (kept loose for testing). */
export interface TransformSource {
  name: string;
  position: { x: number; y: number; z: number };
  scaling: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  rotationQuaternion: { toEulerAngles(): { x: number; y: number; z: number } } | null;
}

/**
 * Read an attached mesh's transform into the patch the store expects. The rotation
 * gizmo writes a quaternion, so convert to degrees-euler. The game-camera helper drives
 * the camera (not an entity); in 2D it only pans in XY with a fixed depth/orientation.
 */
export function readGizmoTransform(mesh: TransformSource, mode: GameMode, cam2dZ: number): GizmoTransform {
  const euler = mesh.rotationQuaternion ? mesh.rotationQuaternion.toEulerAngles() : mesh.rotation;
  const rotation = { x: euler.x * RAD, y: euler.y * RAD, z: euler.z * RAD };
  const position = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
  if (isCameraHelperMesh(mesh as unknown as AbstractMesh)) {
    if (mode === '2d') {
      return { kind: 'camera', position: { x: position.x, y: position.y, z: cam2dZ }, rotation: { x: 0, y: 0, z: 0 } };
    }
    return { kind: 'camera', position, rotation };
  }
  return { kind: 'entity', position, rotation, scale: { x: mesh.scaling.x, y: mesh.scaling.y, z: mesh.scaling.z } };
}

/** Context for the per-camera editor render gate. */
export interface RenderGateCtx {
  editorCamera: Camera;
  highlight: HighlightLayer;
  engine: AbstractEngine;
  mode: GameMode;
  gameOrthoSize: number;
}

/**
 * Gate editor-only overlays (selection highlight + gizmo utility layers) to the editor
 * camera so they don't bleed into the game view, and — in 2D — keep each orthographic
 * camera's frustum matched to its view's aspect ratio (done per-camera-render because
 * the editor and game views differ in size).
 */
export function applyEditorRenderGating(cam: Camera, ctx: RenderGateCtx): void {
  const editorView = cam === ctx.editorCamera;
  ctx.highlight.isEnabled = editorView;
  const util = UtilityLayerRenderer.DefaultUtilityLayer;
  const utilDepth = UtilityLayerRenderer.DefaultKeepDepthUtilityLayer;
  if (util) util.shouldRender = editorView;
  if (utilDepth) utilDepth.shouldRender = editorView;
  if (ctx.mode === '2d') {
    const aspect = ctx.engine.getRenderWidth() / ctx.engine.getRenderHeight() || 16 / 9;
    const halfH = editorView ? Math.max((ctx.editorCamera as ArcRotateCamera).radius * 0.5, 0.5) : ctx.gameOrthoSize;
    cam.orthoTop = halfH;
    cam.orthoBottom = -halfH;
    cam.orthoLeft = -halfH * aspect;
    cam.orthoRight = halfH * aspect;
  }
}

/** Frame the editor camera on a mesh (or a sensible default when nothing is selected). */
export function focusCameraOn(editorCamera: ArcRotateCamera, mesh: AbstractMesh | undefined): void {
  const target = mesh ? mesh.getBoundingInfo().boundingSphere.centerWorld : new Vector3(0, 1, 0);
  editorCamera.setTarget(target.clone());
  if (mesh) {
    const r = mesh.getBoundingInfo().boundingSphere.radiusWorld || 1;
    editorCamera.radius = Math.max(r * 3.2, 3);
  }
}
