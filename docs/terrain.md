# Terrain

A **terrain** is a mesh entity (`mesh.kind === 'terrain'`) — a subdivided ground
plane you sculpt with brushes. It reuses the PBR material system, so a CC0 ground
texture (grass/rock/etc.) can be applied like any other mesh, and it gets a static
mesh collider so players walk its surface.

| Concern | File |
|---|---|
| Config type + defaults | [src/types/index.ts](../src/types/index.ts) — `TerrainConfig`, `defaultTerrain()` |
| Brush math (pure) | [src/babylon/terrainBrush.ts](../src/babylon/terrainBrush.ts) |
| Mesh build + displace | [src/babylon/terrainMesh.ts](../src/babylon/terrainMesh.ts) |
| Sculpt controller | [src/babylon/SculptController.ts](../src/babylon/SculptController.ts) |
| Store actions | [src/store/slices/entitySlice.ts](../src/store/slices/entitySlice.ts) — `addTerrain`, `updateTerrain`; brush state in [uiSlice.ts](../src/store/slices/uiSlice.ts) |
| UI | [src/panels/TerrainPanel.tsx](../src/panels/TerrainPanel.tsx) (Inspector → terrain Mesh section) |
| Physics collider | [src/babylon/PhysicsManager.ts](../src/babylon/PhysicsManager.ts) — `PhysicsShapeType.MESH` |

## Heightfield

`TerrainConfig.heights` is a row-major `(subdivisions + 1)²` array of **normalized
[0,1]** elevations, scaled by `maxHeight` at build time — so changing `maxHeight`
rescales existing sculpts. The array is "z-up natural" (row index increases with
+z); `terrainMesh.applyHeightsToMesh` flips the row when writing vertex Y because
Babylon's `CreateGround` emits +z rows first, keeping `terrainBrush` free of that
detail. An empty/length-mismatched `heights` renders flat (so changing
`subdivisions`/`size` resets the sculpt — the panel clears `heights` on those edits).

## Sculpting

Add a terrain (viewport right-click → **Add Terrain**), select it, and toggle
**Sculpt** in the Inspector. While active, `SceneManager` detaches editor-camera
rotation and routes pointer drags to `SculptController`, which raycasts the cursor
onto the terrain, converts the world hit to terrain-local coords, applies the brush
to the heightfield (`terrainBrush.applyBrush`), and re-displaces the mesh live. On
pointer-up the heightfield is committed via `updateTerrain` (one undoable edit).
Brushes: **raise / lower / smooth / flatten**, with size + strength controls.

## `sync()` reconciliation

`sceneSync.reconcileEntities` rebuilds the terrain mesh only when its grid
(`size`/`subdivisions`) changes; height/`maxHeight` edits just re-displace the
existing updatable mesh.

## Not yet implemented (follow-ups)

- **Heightmap-image import** — initialize `heights` by sampling an imported
  grayscale image (`CreateGroundFromHeightMap`).
- **Splat painting** — blend up to 4 PBR materials via a painted weightmap. Terrain
  currently takes a single PBR material via the standard Material editor.
