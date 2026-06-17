# Prefabs

A **prefab** is a reusable, named entity template — an entity plus its attached
behaviours, captured once and stamped into any scene as a fresh instance. Prefabs
are **game-level** (shared across all scenes in a game).

| Concern | File |
|---|---|
| Type | [src/types/index.ts](../src/types/index.ts) — `PrefabDef` |
| Store actions | [src/store/slices/prefabSlice.ts](../src/store/slices/prefabSlice.ts) — `savePrefab`, `instantiatePrefab`, `removePrefab`, `hydratePrefabs` |
| Persistence | [src/store/projectStore.ts](../src/store/projectStore.ts) — `prefabsOf`, saved in `games.settings.prefabs` |
| UI | [src/panels/PrefabsPanel.tsx](../src/panels/PrefabsPanel.tsx) (Inspector, no selection) + "Save as Prefab" in the Inspector |

## Usage

- **Save**: select an entity → Inspector → **Save as Prefab**. Captures a deep
  clone of the entity (mesh/material/physics/effects/transform) plus its scripts.
- **Place**: with nothing selected, the Inspector shows the **Prefabs** list;
  click **Place** to stamp a fresh instance (new entity id + freshly-cloned script
  ids, via the same approach as `duplicateEntity`).

## Persistence

Prefabs live on the editor store as `prefabs: Record<string, PrefabDef>` and are
written into the game settings blob alongside `design` on every save
(`projectStore.save`), and read back by `prefabsOf` on `openGame`. No DB migration
— they ride in the existing `games.settings` JSON. Editing the library marks the
project dirty so autosave persists it.

## Notes / follow-ups

- A prefab currently captures a **single entity** + its scripts (matching
  `duplicateEntity`). Full child-subtree capture (by `parentId`) is a follow-up.
- Instances are independent copies — there is no live link back to the prefab, so
  editing a prefab does not update existing instances.
