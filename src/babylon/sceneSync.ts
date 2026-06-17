import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Light } from '@babylonjs/core/Lights/light';
import type { Entity, GameMode } from '@/types';
import { defaultTerrain } from '@/types';
import { buildMesh, applyTransform, reconcileEntityLight } from './sceneBuilders';
import { syncEntityMaterial, type MatKind } from './materials';
import { applyHeightsToMesh } from './terrainMesh';
import { syncModelEntity, type ModelContext } from './modelLoader';

/** Per-entity Babylon objects the SceneManager tracks between syncs. */
export interface Tracked {
  mesh?: AbstractMesh;
  light?: Light;
  meshKind?: string;
  lightKind?: string;
  /** Material class currently on `mesh` (so we only rebuild on a shading/trigger change). */
  matKind?: MatKind;
  /** Terrain grid signature `size:subdivisions` — rebuild the mesh when it changes. */
  terrainKey?: string;
  /** For `kind:'model'` meshes — the asset id currently instantiated under `mesh`. */
  modelAssetId?: string;
  /** True while the model is being loaded/instantiated (guards double-loads). */
  modelLoading?: boolean;
}

/** What `reconcileEntities` needs from the SceneManager. */
export interface SyncContext {
  scene: Scene;
  mode: GameMode;
  tracked: Map<string, Tracked>;
  modelCtx: () => ModelContext;
}

/**
 * Reconcile the tracked Babylon objects with the store's entity list: dispose
 * stale meshes/lights, (re)build meshes when their kind (or terrain grid) changes,
 * apply materials + visibility + transforms, and reconcile lights. Transforms are
 * skipped while playing (the runtime owns positions). Extracted from SceneManager
 * to keep that orchestrator small; shadow re-sync is done by the caller.
 */
export function reconcileEntities(ctx: SyncContext, entities: Entity[], opts: { skipTransforms?: boolean }): void {
  const { scene, mode, tracked } = ctx;
  const present = new Set(entities.map((e) => e.id));

  for (const [id, t] of tracked) {
    if (!present.has(id)) {
      t.mesh?.dispose();
      t.light?.dispose();
      tracked.delete(id);
    }
  }

  for (const e of entities) {
    let t = tracked.get(e.id);
    if (!t) {
      t = {};
      tracked.set(e.id, t);
    }

    if (e.mesh) {
      if (e.mesh.kind === 'model') {
        syncModelEntity(ctx.modelCtx(), t, e, opts);
      } else {
        // Terrain rebuilds only when its grid (size/subdivisions) changes;
        // height/maxHeight edits just re-displace the existing mesh.
        const terrain = e.mesh.kind === 'terrain' ? e.mesh.terrain ?? defaultTerrain() : null;
        const terrainKey = terrain ? `${terrain.size}:${terrain.subdivisions}` : undefined;
        if (!t.mesh || t.meshKind !== e.mesh.kind || (terrainKey && t.terrainKey !== terrainKey)) {
          t.mesh?.dispose();
          t.mesh = buildMesh(scene, e);
          t.meshKind = e.mesh.kind;
          t.modelAssetId = undefined;
          t.matKind = undefined; // force material (re)creation for the new mesh
          t.terrainKey = terrainKey;
        } else if (terrain) {
          applyHeightsToMesh(t.mesh as Mesh, terrain);
        }
        t.matKind = syncEntityMaterial(scene, t.mesh, e, mode, t.matKind);
        // `visible` toggles rendering only (isVisible), keeping hidden meshes
        // collidable; setEnabled(true) undoes a runtime setActive(false).
        t.mesh.setEnabled(true);
        t.mesh.isVisible = e.mesh.visible;
        t.mesh.isPickable = e.mesh.visible || !!e.trigger?.enabled;
        if (!opts.skipTransforms) applyTransform(t.mesh, e.transform);
      }
    } else if (t.mesh) {
      t.mesh.dispose();
      t.mesh = undefined;
      t.meshKind = undefined;
    }

    reconcileEntityLight(scene, t, e);
  }
}
