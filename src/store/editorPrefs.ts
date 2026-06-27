/**
 * Per-user editor preferences — appearance/UX knobs that belong to the person, not
 * the project. They persist locally (localStorage) and are independent of any game,
 * which is what distinguishes them from the game-level `RenderSettings` on the design
 * doc (those hydrate/save through the project backend). New categories slot in as
 * extra keys on EditorPrefs; load() back-fills them from the defaults.
 */

/** Selection-highlight appearance (the Babylon HighlightLayer drawn around the picked mesh). */
export interface SelectionPrefs {
  /** Flood the selected object's interior with the highlight color. Off = outline only. */
  innerGlow: boolean;
  /** Outline/glow color for a selected object. */
  outlineColor: string;
  /** Outline/glow color when the game-camera helper is the selection. */
  cameraColor: string;
  /** Glow softness — the HighlightLayer blur size, applied to both axes. */
  glow: number;
  /** Overlay strength 0–1: scales the highlight color so the object's own texture
   *  shows through (1 = full tint, lower = more transparent overlay). */
  opacity: number;
}

/** Editor grid appearance (the line-grid drawn on the ground/work plane; editor-only). */
export interface GridPrefs {
  /** Half-extent in world units — the grid spans ±extent from the origin. */
  extent: number;
  /** Cell size in world units (spacing between grid lines). */
  cellSize: number;
  /** Grid line color. */
  color: string;
  /** Grid line opacity 0–1. */
  opacity: number;
}

export interface EditorPrefs {
  selection: SelectionPrefs;
  grid: GridPrefs;
}

export function defaultEditorPrefs(): EditorPrefs {
  return {
    selection: {
      innerGlow: false,
      outlineColor: '#ffcc44',
      cameraColor: '#22d3ee',
      glow: 1,
      opacity: 1,
    },
    grid: {
      extent: 20,
      cellSize: 1,
      color: '#2e1f57',
      opacity: 1,
    },
  };
}

const STORAGE_KEY = 'vyper:editorPrefs';

/** Merge a partial (saved) prefs object over a base, per-category, so missing keys back-fill.
 *  Used by both localStorage load and per-project DB hydration. */
export function mergeEditorPrefs(base: EditorPrefs, saved: Partial<EditorPrefs> | undefined): EditorPrefs {
  return {
    selection: { ...base.selection, ...(saved?.selection ?? {}) },
    grid: { ...base.grid, ...(saved?.grid ?? {}) },
  };
}

/** Load saved prefs merged over the current defaults, so keys added since the save back-fill. */
export function loadEditorPrefs(): EditorPrefs {
  const base = defaultEditorPrefs();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    return mergeEditorPrefs(base, JSON.parse(raw) as Partial<EditorPrefs>);
  } catch {
    // Corrupt JSON or storage unavailable (private mode/SSR) — fall back to defaults.
    return base;
  }
}

export function saveEditorPrefs(prefs: EditorPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable — prefs simply stay in-memory for this session.
  }
}
