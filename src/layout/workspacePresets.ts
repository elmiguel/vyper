import type { DockviewApi } from 'dockview';
import { PANELS, type PanelKey } from './panels';

type DockDirection = 'left' | 'right' | 'above' | 'below' | 'within';

/** A panel arrangement applied imperatively to a fresh (cleared) dockview api. */
export interface WorkspacePreset {
  id: string;
  label: string;
  /** Build the arrangement on an empty dock. Keep panel ids === PanelKey. */
  build: (api: DockviewApi) => void;
}

type AddOpts = {
  position?: { referencePanel: string; direction?: DockDirection };
  initialWidth?: number;
  initialHeight?: number;
};

/** Add a panel by its registry key (id, component, and title all derive from the key). */
function add(api: DockviewApi, key: PanelKey, opts?: AddOpts) {
  return api.addPanel({
    id: key,
    component: key,
    title: PANELS[key].title,
    ...opts,
  });
}

/**
 * Default arrangement — mirrors the original hand-nested layout:
 * Hierarchy (left) | [ Scene + Game (top) / Scripts (mid) / Debugger (bottom) ] | Inspector (right).
 */
function buildDefault(api: DockviewApi) {
  add(api, 'scene');
  add(api, 'preview', { position: { referencePanel: 'scene', direction: 'right' } });
  add(api, 'hierarchy', { position: { referencePanel: 'scene', direction: 'left' }, initialWidth: 240 });
  add(api, 'inspector', { position: { referencePanel: 'preview', direction: 'right' }, initialWidth: 300 });
  add(api, 'scripts', { position: { referencePanel: 'scene', direction: 'below' } });
  add(api, 'console', { position: { referencePanel: 'scripts', direction: 'below' }, initialHeight: 160 });
}

/** Scene-focused — big viewport, Hierarchy + Inspector tabbed on the right. */
function buildSceneFocus(api: DockviewApi) {
  add(api, 'scene');
  add(api, 'hierarchy', { position: { referencePanel: 'scene', direction: 'right' }, initialWidth: 300 });
  add(api, 'inspector', { position: { referencePanel: 'hierarchy', direction: 'within' } });
  add(api, 'preview', { position: { referencePanel: 'scene', direction: 'below' }, initialHeight: 200 });
  add(api, 'scripts', { position: { referencePanel: 'preview', direction: 'within' } });
  add(api, 'console', { position: { referencePanel: 'preview', direction: 'within' } });
}

/** Scripting-focused — Scripts large, Scene + Debugger tabbed below, Hierarchy left. */
function buildScripting(api: DockviewApi) {
  add(api, 'scripts');
  add(api, 'hierarchy', { position: { referencePanel: 'scripts', direction: 'left' }, initialWidth: 240 });
  add(api, 'inspector', { position: { referencePanel: 'scripts', direction: 'right' }, initialWidth: 300 });
  add(api, 'scene', { position: { referencePanel: 'scripts', direction: 'below' }, initialHeight: 240 });
  add(api, 'preview', { position: { referencePanel: 'scene', direction: 'within' } });
  add(api, 'console', { position: { referencePanel: 'scene', direction: 'within' } });
}

/**
 * Compact (the user's described layout): Scene + Scripts + Debugger combined as tabs in the
 * center, Hierarchy + Inspector combined as tabs on the side.
 */
function buildCompact(api: DockviewApi) {
  add(api, 'scene');
  add(api, 'scripts', { position: { referencePanel: 'scene', direction: 'within' } });
  add(api, 'console', { position: { referencePanel: 'scene', direction: 'within' } });
  add(api, 'preview', { position: { referencePanel: 'scene', direction: 'within' } });
  add(api, 'hierarchy', { position: { referencePanel: 'scene', direction: 'right' }, initialWidth: 300 });
  add(api, 'inspector', { position: { referencePanel: 'hierarchy', direction: 'within' } });
}

/**
 * Tabbed — clean three-stack layout: Scene + Game tabbed top-left, Scripts +
 * Debugger tabbed bottom-left, Hierarchy + Inspector tabbed in a full-height
 * right column. (Hierarchy is added before the left column is split vertically
 * so its column spans the full height.)
 */
function buildTabbed(api: DockviewApi) {
  add(api, 'scene');
  add(api, 'hierarchy', { position: { referencePanel: 'scene', direction: 'right' }, initialWidth: 300 });
  add(api, 'inspector', { position: { referencePanel: 'hierarchy', direction: 'within' } });
  add(api, 'preview', { position: { referencePanel: 'scene', direction: 'within' } });
  add(api, 'scripts', { position: { referencePanel: 'scene', direction: 'below' }, initialHeight: 200 });
  add(api, 'console', { position: { referencePanel: 'scripts', direction: 'within' } });
}

export const BUILTIN_PRESETS: Record<string, WorkspacePreset> = {
  default: { id: 'default', label: 'Default', build: buildDefault },
  tabbed: { id: 'tabbed', label: 'Tabbed', build: buildTabbed },
  'scene-focus': { id: 'scene-focus', label: 'Scene Focus', build: buildSceneFocus },
  scripting: { id: 'scripting', label: 'Scripting', build: buildScripting },
  compact: { id: 'compact', label: 'Compact', build: buildCompact },
};

export const DEFAULT_PRESET_ID = 'default';

/** Clear the dock and apply a built-in preset's arrangement. */
export function applyPreset(api: DockviewApi, preset: WorkspacePreset) {
  api.clear();
  preset.build(api);
}
