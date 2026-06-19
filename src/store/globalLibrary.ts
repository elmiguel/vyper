import { api } from '@/data';
import type { Asset } from '@/types';

/**
 * The shared (cross-project) asset library.
 *
 * Generated Modeling-Studio assets are normally persisted per project (each project keeps its own
 * snapshot in `settings.generatedAssets`). That makes a *reference* asset — a proxy that's supposed
 * to update everywhere when its source is edited — impossible across projects, because every project
 * holds an independent copy.
 *
 * Reference assets therefore also live in ONE canonical store: the app-state singleton's `data` blob
 * (`data.library`). On project open we merge this library *over* the project's local copies, so a
 * reference resolves to the shared, latest version. Editing the source object and saving republishes
 * it here, so every project's references pick up the change on their next load.
 */

const LIB_KEY = 'library';

type AppState = { lastGameId: string | null; data: Record<string, unknown> };

async function readApp(): Promise<AppState> {
  try {
    const app = await api.getApp();
    return { lastGameId: app.lastGameId ?? null, data: app.data ?? {} };
  } catch {
    return { lastGameId: null, data: {} };
  }
}

function libraryOf(data: Record<string, unknown>): Asset[] {
  const lib = data[LIB_KEY] as Asset[] | undefined;
  return Array.isArray(lib) ? lib : [];
}

/** The shared reference-asset library (empty if the backend is unavailable). */
export async function loadGlobalLibrary(): Promise<Asset[]> {
  const app = await readApp();
  return libraryOf(app.data);
}

/**
 * Upsert reference assets into the shared library (by id; the incoming version wins). Read-modify-write
 * so it preserves `lastGameId` and any other keys in the app-state `data` blob.
 */
export async function publishGlobalLibrary(refs: Asset[]): Promise<void> {
  if (refs.length === 0) return;
  const app = await readApp();
  const byId = new Map(libraryOf(app.data).map((a) => [a.id, a]));
  for (const a of refs) byId.set(a.id, a);
  await api.putApp({ lastGameId: app.lastGameId, data: { ...app.data, [LIB_KEY]: [...byId.values()] } });
}

/** Remove an asset from the shared library (reference turned off, or the asset deleted). */
export async function unpublishGlobalLibrary(id: string): Promise<void> {
  const app = await readApp();
  const lib = libraryOf(app.data);
  if (!lib.some((a) => a.id === id)) return;
  await api.putApp({ lastGameId: app.lastGameId, data: { ...app.data, [LIB_KEY]: lib.filter((a) => a.id !== id) } });
}

/**
 * Record the last-opened game without clobbering the app-state `data` blob (the shared library lives
 * there). A bare `putApp({ lastGameId })` would reset `data` to `{}`, wiping the library.
 */
export async function setLastGame(id: string): Promise<void> {
  const app = await readApp();
  await api.putApp({ lastGameId: id, data: app.data });
}
