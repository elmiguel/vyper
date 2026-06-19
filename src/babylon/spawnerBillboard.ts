import type { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Constants } from '@babylonjs/core/Engines/constants';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { EDITOR_LAYER } from './editorObjects';

/** Render group for the spawner billboard — above scene geometry (group 0) and the edit-mode
 *  overlays (group 1), so the icon always draws on top of the object it sits on. */
const ON_TOP_GROUP = 3;
const TEX = 256; // procedural icon resolution

/**
 * Build the editor-only spawner billboard: a camera-facing plane with a procedurally-drawn
 * "spawn portal" icon (a glowing ring + downward arrow). It lives on {@link EDITOR_LAYER} so the
 * game camera never renders it, and on a high rendering group so it draws over whatever object the
 * spawner marks. The mesh is named with the entity id so the existing picking + gizmo machinery
 * treats it like any other selectable entity. No external image asset — the icon is canvas-drawn.
 */
export function buildSpawnerBillboard(scene: Scene, entityId: string): AbstractMesh {
  const plane = MeshBuilder.CreatePlane(entityId, { size: 1.2 }, scene);
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL; // always face the camera (Unreal-style icon)
  plane.layerMask = EDITOR_LAYER;
  plane.renderingGroupId = ON_TOP_GROUP;
  plane.isPickable = true;

  const mat = new StandardMaterial(`${entityId}:spawnerMat`, scene);
  const tex = drawSpawnerIcon(scene, entityId);
  mat.diffuseTexture = tex;
  mat.diffuseTexture.hasAlpha = true;
  mat.useAlphaFromDiffuseTexture = true;
  mat.emissiveColor = new Color3(1, 1, 1); // unlit — read the texture's own colours
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  // Always-on-top: the icon must stay visible over the object it marks (and any geometry), so it
  // ignores the depth buffer entirely — ALWAYS passes the depth test, and writes no depth so it
  // can't occlude the scene. Paired with the high rendering group, it draws over everything.
  mat.depthFunction = Constants.ALWAYS;
  mat.disableDepthWrite = true;
  plane.material = mat;
  return plane;
}

/** Canvas-draw the glowing cyan spawn-portal icon onto a transparent DynamicTexture. */
function drawSpawnerIcon(scene: Scene, entityId: string): DynamicTexture {
  const tex = new DynamicTexture(`${entityId}:spawnerTex`, TEX, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D | null;
  if (!ctx) return tex; // no 2D canvas backend (e.g. headless tests) — leave the texture blank
  const c = TEX / 2;
  ctx.clearRect(0, 0, TEX, TEX);

  // Soft radial glow.
  const glow = ctx.createRadialGradient(c, c, 8, c, c, c);
  glow.addColorStop(0, 'rgba(34,211,238,0.55)');
  glow.addColorStop(1, 'rgba(34,211,238,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, TEX, TEX);

  // Portal ring.
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(c, c, c * 0.62, 0, Math.PI * 2);
  ctx.stroke();

  // Inner downward arrow — "object enters here".
  ctx.fillStyle = '#e0fbff';
  ctx.beginPath();
  ctx.moveTo(c, c + 44);
  ctx.lineTo(c - 34, c - 14);
  ctx.lineTo(c - 12, c - 14);
  ctx.lineTo(c - 12, c - 48);
  ctx.lineTo(c + 12, c - 48);
  ctx.lineTo(c + 12, c - 14);
  ctx.lineTo(c + 34, c - 14);
  ctx.closePath();
  ctx.fill();

  tex.update(true);
  return tex;
}
