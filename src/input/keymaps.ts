/**
 * Data-driven keyboard layouts. Each layout maps editor actions → key combos.
 * A combo is a lowercase string like "mod+z" or "w"; "mod" resolves to ⌘ on
 * macOS and Ctrl elsewhere. The active layout is chosen from a menu in the UI.
 */

export type EditorAction =
  | 'undo'
  | 'redo'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | 'tool.select'
  | 'tool.move'
  | 'tool.rotate'
  | 'tool.scale'
  | 'focus'
  | 'playToggle'
  | 'stop';

export type KeymapId = 'maya' | 'blender' | 'unity';

export interface Keymap {
  id: KeymapId;
  label: string;
  bindings: Record<EditorAction, string[]>;
}

const isMac =
  typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

export const KEYMAPS: Record<KeymapId, Keymap> = {
  maya: {
    id: 'maya',
    label: 'Maya',
    bindings: {
      undo: ['mod+z'],
      redo: ['mod+shift+z', 'mod+y'],
      copy: ['mod+c'],
      paste: ['mod+v'],
      duplicate: ['mod+d'],
      delete: ['delete', 'backspace'],
      'tool.select': ['q'],
      'tool.move': ['w'],
      'tool.rotate': ['e'],
      'tool.scale': ['r'],
      focus: ['f'],
      playToggle: ['mod+enter'],
      stop: ['escape'],
    },
  },
  blender: {
    id: 'blender',
    label: 'Blender',
    bindings: {
      undo: ['mod+z'],
      redo: ['mod+shift+z'],
      copy: ['mod+c'],
      paste: ['mod+v'],
      duplicate: ['shift+d'],
      delete: ['x', 'delete'],
      'tool.select': ['q'],
      'tool.move': ['g'],
      'tool.rotate': ['r'],
      'tool.scale': ['s'],
      focus: ['.'],
      playToggle: ['space'],
      stop: ['escape'],
    },
  },
  unity: {
    id: 'unity',
    label: 'Unity',
    bindings: {
      undo: ['mod+z'],
      redo: ['mod+shift+z', 'mod+y'],
      copy: ['mod+c'],
      paste: ['mod+v'],
      duplicate: ['mod+d'],
      delete: ['delete', 'backspace'],
      'tool.select': ['q'],
      'tool.move': ['w'],
      'tool.rotate': ['e'],
      'tool.scale': ['r'],
      focus: ['f'],
      playToggle: ['mod+p'],
      stop: ['mod+shift+p'],
    },
  },
};

const KEY_ALIASES: Record<string, string> = {
  ' ': 'space',
  spacebar: 'space',
  esc: 'escape',
  del: 'delete',
};

/** Canonical combo string for a keyboard event, e.g. "mod+shift+z". */
export function comboFromEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push('mod');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  let key = e.key.toLowerCase();
  key = KEY_ALIASES[key] ?? key;
  // Ignore lone modifier presses.
  if (['control', 'meta', 'shift', 'alt'].includes(key)) return parts.join('+');
  parts.push(key);
  return parts.join('+');
}

/** Build a combo → action lookup for a layout. */
export function buildLookup(map: Keymap): Map<string, EditorAction> {
  const lookup = new Map<string, EditorAction>();
  (Object.keys(map.bindings) as EditorAction[]).forEach((action) => {
    for (const combo of map.bindings[action]) lookup.set(combo, action);
  });
  return lookup;
}

/** Split a single combo into display key tokens, e.g. "mod+shift+z" → ["⌘","⇧","Z"]. */
export function comboTokens(combo: string): string[] {
  return combo.split('+').map((part) => {
    if (part === 'mod') return isMac ? '⌘' : 'Ctrl';
    if (part === 'shift') return isMac ? '⇧' : 'Shift';
    if (part === 'alt') return isMac ? '⌥' : 'Alt';
    if (part === 'enter') return '⏎';
    if (part === 'escape') return 'Esc';
    if (part === 'space') return 'Space';
    if (part === 'delete') return 'Del';
    if (part === 'backspace') return '⌫';
    if (part === '.') return '.';
    return part.toUpperCase();
  });
}

/** All combos for an action, each as an array of display tokens. */
export function bindingChips(map: Keymap, action: EditorAction): string[][] {
  return (map.bindings[action] ?? []).map(comboTokens);
}

/** Human-readable label for an action's primary combo, for tooltips/menus. */
export function describeBinding(map: Keymap, action: EditorAction): string {
  const combo = map.bindings[action]?.[0];
  if (!combo) return '';
  return combo
    .split('+')
    .map((part) => {
      if (part === 'mod') return isMac ? '⌘' : 'Ctrl';
      if (part === 'shift') return isMac ? '⇧' : 'Shift';
      if (part === 'alt') return isMac ? '⌥' : 'Alt';
      if (part === 'enter') return '⏎';
      if (part === 'escape') return 'Esc';
      if (part === 'space') return 'Space';
      if (part === 'delete') return 'Del';
      return part.toUpperCase();
    })
    .join(isMac ? '' : '+');
}
