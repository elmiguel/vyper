import type { DataApi } from './types';

/**
 * Desktop data provider: a thin shim that forwards every call to the Electron main
 * process over the `window.vyper` IPC bridge, where the shared data service runs
 * against the embedded PGlite database. The method names match the data service
 * exactly (see server/dataService.ts + electron/ipc.ts). This file references only
 * `window.vyper` — never `electron/` — so the heavy desktop/DB/sync code is never
 * bundled into the web renderer.
 */

function call(method: string, ...args: unknown[]): Promise<any> {
  if (typeof window === 'undefined' || !window.vyper) {
    return Promise.reject(new Error('desktop bridge unavailable'));
  }
  return window.vyper.invoke(method, ...args);
}

export const desktopApi: DataApi = {
  getApp: () => call('getApp'),
  putApp: (body) => call('putApp', body),
  listGames: () => call('listGames'),
  getGame: (id) => call('getGame', id),
  createGame: (name, description) => call('createGame', name, description),
  patchGame: (id, patch) => call('patchGame', id, patch),
  deleteGame: (id) => call('deleteGame', id),
  putScripts: (gameId, scripts) => call('putScripts', gameId, scripts),
  getScene: (id) => call('getScene', id),
  createScene: (gameId, name) => call('createScene', gameId, name),
  patchScene: (id, patch) => call('patchScene', id, patch),
  deleteScene: (id) => call('deleteScene', id),
  listVersions: (sceneId) => call('listVersions', sceneId),
  getVersion: (id) => call('getVersion', id),
  createVersion: (sceneId, body) => call('createVersion', sceneId, body),
};
