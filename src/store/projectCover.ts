import { getManager } from '@/babylon/engine';

/** Cover-image logic for projects: viewport capture + the autosave auto-cover rule.
 *  Kept separate from the project store so the store stays focused on persistence. */

/** Projects we've already auto-captured a cover for this session. Prevents the
 *  autosave thumbnail from being re-grabbed on every save once one is set; reset
 *  per project on open so a freshly-opened project is re-evaluated. */
const autoCoveredGames = new Set<string>();

/** Fill `settings.coverImage` from a viewport thumbnail when none is assigned yet.
 *  A cover that's already set (e.g. a user upload) is left untouched, and `capture`
 *  isn't called. Mutates + returns the same settings object. */
export function ensureAutoCover(
  settings: Record<string, unknown>,
  capture: () => string | null,
): Record<string, unknown> {
  if (!settings.coverImage) {
    const thumb = capture();
    if (thumb) settings.coverImage = thumb;
  }
  return settings;
}

/** An active viewport capturer registered by a non-game workspace (e.g. the Modeling Studio,
 *  which runs its own Babylon engine, not the game SceneManager). */
let registeredCapturer: (() => string | null) | null = null;

/** Register the active viewport's thumbnail capturer; it takes precedence over the game
 *  SceneManager so the workspace currently on screen is what gets captured. Pass null to clear
 *  (e.g. on the Studio viewport unmounting). */
export function setViewportCapturer(capture: (() => string | null) | null): void {
  registeredCapturer = capture;
}

/** Grab the current editor viewport as a thumbnail data URL, or null if unavailable. Prefers a
 *  registered capturer (Studio), falling back to the game SceneManager. */
export function captureViewportCover(): string | null {
  return registeredCapturer?.() ?? getManager()?.captureThumbnail() ?? null;
}

/** Clear the once-per-session auto-cover guard for a project (call when opening it). */
export function resetAutoCover(id: string): void {
  autoCoveredGames.delete(id);
}

/** Autosave auto-cover: capture a viewport thumbnail into `settings` the first time
 *  a project is saved with no cover assigned, at most once per session. Never
 *  overwrites an existing cover. Mutates `settings`. */
export function applyAutoCover(gameId: string, settings: Record<string, unknown>): void {
  if (autoCoveredGames.has(gameId)) return;
  ensureAutoCover(settings, captureViewportCover);
  if (settings.coverImage) autoCoveredGames.add(gameId);
}
