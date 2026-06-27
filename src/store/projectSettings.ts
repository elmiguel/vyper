import { nanoid } from 'nanoid';
import type { ScriptRow } from '@/data';
import type { Asset, Entity, GameDesign, GameMode, MaterialPreset, PrefabDef, Script } from '@/types';
import { emptyDesign } from '@/types';
import type { Workspace } from './editorTypes';
import { defaultWorkspace } from './slices/workspaceSlice';
import { loadEditorPrefs, mergeEditorPrefs, type EditorPrefs } from './editorPrefs';

/**
 * Pure codecs for reading typed slices out of a game's `settings` JSONB blob (and
 * DB script rows) with defaults back-filled, plus starter content. Extracted from
 * projectStore so the store file stays focused on the async project lifecycle.
 */

/** A fresh modeling project starts from one editable box at the origin. */
export function modelStarterEntities(): Entity[] {
  return [
    {
      id: nanoid(8),
      name: 'Mesh',
      parentId: null,
      transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
      mesh: { kind: 'box', color: '#9aa3b2', visible: true },
      scriptIds: [],
      props: {},
    },
  ];
}

/** Read the 2D/3D kind off a game's settings blob (defaults to 3D). */
export function gameModeOf(settings: Record<string, unknown> | undefined): GameMode {
  return settings?.kind === '2d' ? '2d' : '3d';
}

/** Read the game design doc off a game's settings blob (defaults to empty). The
 *  nested `render` block is deep-merged over defaults so games saved before newer
 *  render fields (e.g. shadow controls) existed still hydrate a complete object. */
export function designOf(settings: Record<string, unknown> | undefined): GameDesign {
  const base = emptyDesign();
  const d = settings?.design as Partial<GameDesign> | undefined;
  if (!d) return base;
  return { ...base, ...d, render: { ...base.render, ...(d.render ?? {}) }, studioEnv: { ...base.studioEnv, ...(d.studioEnv ?? {}) } };
}

/** Read the prefab library off a game's settings blob (defaults to empty). */
export function prefabsOf(settings: Record<string, unknown> | undefined): Record<string, PrefabDef> {
  return (settings?.prefabs as Record<string, PrefabDef> | undefined) ?? {};
}

/** Read project-persisted generated assets (Modeling-Studio objects + their textures) off the
 *  settings blob (defaults to none). */
export function generatedAssetsOf(settings: Record<string, unknown> | undefined): Asset[] {
  return (settings?.generatedAssets as Asset[] | undefined) ?? [];
}

/** Read the saved material presets off a game's settings blob (defaults to empty). */
export function materialsOf(settings: Record<string, unknown> | undefined): Record<string, MaterialPreset> {
  return (settings?.materials as Record<string, MaterialPreset> | undefined) ?? {};
}

/** Read the dockable-workspace layout off a game's settings blob (defaults to fresh). */
export function workspaceOf(settings: Record<string, unknown> | undefined): Workspace {
  const w = settings?.workspace as Partial<Workspace> | undefined;
  return { ...defaultWorkspace(), ...(w ?? {}) };
}

/** Read per-project editor settings (grid + selection appearance) off the settings blob.
 *  Falls back to the user's localStorage defaults so a project saved before these existed
 *  (or one never customized) inherits the cross-project defaults rather than hard defaults. */
export function editorSettingsOf(settings: Record<string, unknown> | undefined): EditorPrefs {
  return mergeEditorPrefs(loadEditorPrefs(), settings?.editorSettings as Partial<EditorPrefs> | undefined);
}

/** True when a game's settings mark it as a 3D-modeling project (not a playable game). */
export function isModelProject(settings: Record<string, unknown> | undefined): boolean {
  return settings?.kind === 'model';
}

/** Convert persisted script rows into the editor's keyed script map. */
export function rowsToScripts(rows: ScriptRow[]): Record<string, Script> {
  const out: Record<string, Script> = {};
  for (const r of rows) {
    out[r.id] = {
      id: r.id,
      name: r.name,
      mode: r.mode,
      code: r.code,
      codeDirty: r.codeDirty,
      enabled: r.enabled,
      graph: { nodes: (r.graph?.nodes as never) ?? [], edges: (r.graph?.edges as never) ?? [] },
    };
  }
  return out;
}
