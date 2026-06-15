/**
 * Editor-only "objects" that aren't entities but still appear in the Hierarchy
 * and can be selected/inspected (e.g. the game camera). They live on a dedicated
 * Babylon layer so they render in the editor viewport but never in the game view.
 */

/** Selection id for the game-play camera rig. */
export const GAME_CAMERA_ID = '__gameCamera';

/** Layer bit for editor-only meshes (grid, camera helper). The editor camera's
 * mask includes it; the game camera's mask does not, so they stay out of play. */
export const EDITOR_LAYER = 0x20000000;
/** Default Babylon mask — what every normal mesh and the game camera see. */
export const DEFAULT_LAYER = 0x0fffffff;

export const isEditorObjectId = (id: string | null): boolean => id === GAME_CAMERA_ID;
