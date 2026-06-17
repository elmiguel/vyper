import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Color3 } from '@babylonjs/core/Maths/math';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import './loaders'; // register OBJ/glTF (idempotent)
import { defaultImportTransform, type Asset, type Entity } from '@/types';
import { computeModelTransform } from '@/assets/modelTransform';
import { applyTransform } from './sceneBuilders';
import { DEFAULT_LAYER } from './editorObjects';

const DEG = Math.PI / 180;
/** Where built-in assets are served (mirrors assetSlice.ASSET_ROOT; kept local so
 *  the babylon layer doesn't import the store). Uploaded assets carry absolute URLs. */
const ASSET_ROOT = '/assets/';

const hexToColor3 = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return new Color3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/**
 * Loads + instantiates model assets into the editor scene. One AssetContainer is
 * loaded per asset (cached) and cheaply instantiated for each placement. The
 * instantiated hierarchy is parented under an inner node carrying the asset's
 * import transform, which itself sits under the entity's root node — so the
 * entity transform (gizmo/inspector) composes on top of the import transform.
 */
export class ModelLoader {
  private cache = new Map<string, Promise<AssetContainer>>();

  constructor(private scene: Scene) {}

  private container(asset: Asset): Promise<AssetContainer> {
    let p = this.cache.get(asset.id);
    if (!p) {
      p = SceneLoader.LoadAssetContainerAsync(asset.rootUrl ?? ASSET_ROOT, asset.modelFile!, this.scene);
      this.cache.set(asset.id, p);
    }
    return p;
  }

  /** Drop the cached container for an asset (call after its files change/upload). */
  invalidate(assetId: string) {
    this.cache.delete(assetId);
  }

  /**
   * Instantiate `asset` under `root` (the entity's node, named with the entity id).
   * Tags every child mesh with `metadata.entityId` for picking, applies the import
   * transform + optional tint. Safe if `root` is disposed mid-load (no-op).
   */
  async instantiate(root: TransformNode, asset: Asset, entityId: string): Promise<void> {
    if (!asset.modelFile) return;
    const container = await this.container(asset);
    if (root.isDisposed()) return;

    const inner = new TransformNode('asset-import', this.scene);
    inner.parent = root;
    const entries = container.instantiateModelsToScene((n) => n, false);
    entries.animationGroups.forEach((g) => g.stop());
    for (const node of entries.rootNodes) node.parent = inner;

    // Measure raw bounds (inner is still at identity), then apply the import transform.
    const { min, max } = inner.getHierarchyBoundingVectors(true);
    const r = computeModelTransform(asset.importTransform ?? defaultImportTransform(), { min, max });
    inner.position.set(r.position.x, r.position.y, r.position.z);
    inner.rotation.set(r.rotationDeg.x * DEG, r.rotationDeg.y * DEG, r.rotationDeg.z * DEG);
    inner.scaling.set(r.scaling.x, r.scaling.y, r.scaling.z);

    const tint = asset.material?.colorHex ? hexToColor3(asset.material.colorHex) : null;
    const doubleSided = asset.material?.doubleSided;
    const rootUrl = asset.rootUrl ?? ASSET_ROOT;
    const maps = asset.material?.mapAssignments;
    for (const m of inner.getChildMeshes()) {
      m.metadata = { ...(m.metadata ?? {}), entityId };
      m.layerMask = DEFAULT_LAYER;
      m.isPickable = true;
      m.receiveShadows = true;
      const mat = m.material as { name?: string; diffuseColor?: Color3; albedoColor?: Color3; diffuseTexture?: Texture; albedoTexture?: Texture; backFaceCulling?: boolean } | null;
      if (mat && tint && 'diffuseColor' in mat) mat.diffuseColor = tint;
      if (mat && tint && 'albedoColor' in mat) mat.albedoColor = tint;
      if (mat && doubleSided !== undefined) mat.backFaceCulling = !doubleSided;
      // Per-material texture overrides (material name → texture filename), applied
      // to the albedo/diffuse channel of whichever material class the model uses.
      const file = mat?.name ? maps?.[mat.name] : undefined;
      if (mat && file) {
        const tex = new Texture(`${rootUrl}${file}`, this.scene);
        if ('albedoTexture' in mat) mat.albedoTexture = tex;
        else if ('diffuseTexture' in mat) mat.diffuseTexture = tex;
      }
    }

    // Give the (empty) container root real bounds covering the model, so a BOX
    // physics collider built from it encloses the whole model rather than a point.
    const refreshable = root as unknown as { refreshBoundingInfo?: (o: { includeDescendants: boolean }) => void };
    refreshable.refreshBoundingInfo?.({ includeDescendants: true });
  }
}

/** The slice of a SceneManager `Tracked` entry the model sync needs (structural). */
export interface ModelSlot {
  mesh?: AbstractMesh;
  meshKind?: string;
  modelAssetId?: string;
  modelLoading?: boolean;
}

/** Everything the model-sync free functions need from the SceneManager. */
export interface ModelContext {
  scene: Scene;
  loader: ModelLoader;
  assets: Map<string, Asset>;
}

/** Instantiate a placed model's asset under its node, once, if the asset is known. */
export function loadModelInto(ctx: ModelContext, slot: ModelSlot, entityId: string) {
  if (!slot.mesh || slot.modelLoading || slot.mesh.getChildMeshes().length > 0) return;
  const asset = slot.modelAssetId ? ctx.assets.get(slot.modelAssetId) : undefined;
  if (!asset) return; // asset not loaded yet — a later setAssetLibrary() will retry
  slot.modelLoading = true;
  void ctx.loader.instantiate(slot.mesh as TransformNode, asset, entityId).finally(() => {
    slot.modelLoading = false;
  });
}

/** Reconcile one `kind:'model'` entity: (re)build its container node, kick the
 *  async instantiate, and apply visibility + the entity transform. */
export function syncModelEntity(ctx: ModelContext, slot: ModelSlot, e: Entity, opts: { skipTransforms?: boolean }) {
  const assetId = e.mesh!.assetId;
  if (!slot.mesh || slot.meshKind !== 'model' || slot.modelAssetId !== assetId) {
    slot.mesh?.dispose(); // disposes the instantiated child hierarchy too
    const root = new Mesh(e.id, ctx.scene); // empty container; name = entity id
    root.isPickable = false; // child meshes carry picking via metadata.entityId
    slot.mesh = root;
    slot.meshKind = 'model';
    slot.modelAssetId = assetId;
    slot.modelLoading = false;
    loadModelInto(ctx, slot, e.id);
  }
  const visible = e.mesh!.visible;
  slot.mesh.setEnabled(true);
  for (const child of slot.mesh.getChildMeshes()) {
    child.isVisible = visible;
    child.isPickable = visible;
  }
  if (!opts.skipTransforms) applyTransform(slot.mesh, e.transform);
}
