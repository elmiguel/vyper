import type { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Entity, GameMode } from '@/types';
import { applyEntityMeshMaterial, DEFAULT_LAYER } from './sceneBuilders';

/** Which material class a mesh should use right now. */
export type MatKind = 'pbr' | 'std';

/**
 * The material class a mesh needs: 2D meshes and trigger volumes are always flat
 * StandardMaterial; lit 3D meshes are PBR unless the material opts into
 * `'standard'`. Entities with no material config default to PBR in 3D.
 */
export function desiredMatKind(e: Entity, mode: GameMode): MatKind {
  if (mode === '2d' || e.trigger?.enabled) return 'std';
  return (e.mesh?.material?.shading ?? 'pbr') === 'standard' ? 'std' : 'pbr';
}

/** Assign a texture to a PBR slot, reusing the existing texture when the URL is
 *  unchanged so repeated syncs don't reload (and leak) GPU textures. */
function setMap(mat: PBRMaterial, key: 'albedoTexture' | 'bumpTexture' | 'metallicTexture' | 'ambientTexture' | 'emissiveTexture', url: string | null, scene: Scene) {
  const cur = mat[key] as Texture | null;
  if (!url) {
    if (cur) { cur.dispose(); mat[key] = null; }
    return;
  }
  if (cur && cur.name === url) return;
  cur?.dispose();
  mat[key] = new Texture(url, scene);
}

/** Configure a PBR material from an entity's MaterialConfig (map fields are URLs). */
function applyPbr(scene: Scene, mesh: AbstractMesh, e: Entity) {
  const mat = mesh.material as PBRMaterial;
  const m = e.mesh!.material;
  // Mesh color is the base tint; with a base-color map, use white so the texture shows true.
  mat.albedoColor = m?.baseColorMap ? Color3.White() : Color3.FromHexString(e.mesh!.color);
  mat.metallic = m?.metallic ?? 0;
  mat.roughness = m?.roughness ?? 1;
  mat.alpha = m?.alpha ?? 1;
  mat.emissiveColor = m?.emissive
    ? Color3.FromHexString(m.emissive).scale(m.emissiveIntensity ?? 1)
    : Color3.Black();
  mesh.layerMask = DEFAULT_LAYER;
  mesh.visibility = 1;

  setMap(mat, 'albedoTexture', m?.baseColorMap ?? null, scene);
  setMap(mat, 'bumpTexture', m?.normalMap ?? null, scene);
  setMap(mat, 'emissiveTexture', m?.emissiveMap ?? null, scene);
  // Grayscale roughness map → green channel of metallicTexture; metalness stays
  // scalar (CC0 materials are mostly dielectric, and ship separate gray maps).
  const roughUrl = m?.roughnessMap ?? null;
  setMap(mat, 'metallicTexture', roughUrl, scene);
  mat.useRoughnessFromMetallicTextureGreen = !!roughUrl;
  mat.useMetallnessFromMetallicTextureBlue = false;
  mat.useRoughnessFromMetallicTextureAlpha = false;
  // Ambient occlusion.
  setMap(mat, 'ambientTexture', m?.aoMap ?? null, scene);
}

/**
 * Ensure `mesh` carries the right material class and is configured from the
 * entity. Rebuilds the material only when the class changes (shading toggle,
 * trigger toggle), otherwise patches in place. Returns the resulting kind so the
 * caller can cache it on its tracked slot.
 */
export function syncEntityMaterial(
  scene: Scene,
  mesh: AbstractMesh,
  e: Entity,
  mode: GameMode,
  currentKind: MatKind | undefined,
): MatKind {
  const want = desiredMatKind(e, mode);
  if (currentKind !== want || !mesh.material) {
    mesh.material?.dispose();
    mesh.material = want === 'pbr' ? new PBRMaterial(`${e.id}_mat`, scene) : new StandardMaterial(`${e.id}_mat`, scene);
  }
  if (want === 'pbr') applyPbr(scene, mesh, e);
  else applyEntityMeshMaterial(mesh, e, mode);
  return want;
}
