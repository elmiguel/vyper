import { ipcMain } from 'electron';
import type { DataService } from '../server/dataService.js';

/**
 * Bridge renderer data calls to the shared data service over one IPC channel.
 * The renderer's desktop provider (src/data/desktopApi.ts) sends `(method, args)`;
 * we dispatch to the matching service method running against the embedded DB.
 * A thrown ServiceError rejects the renderer's invoke (the HTTP client throws too),
 * so error handling is identical across web and desktop.
 */
export function registerIpc(svc: DataService): void {
  ipcMain.handle('vyper:invoke', async (_event, method: string, args: unknown[]) => {
    const fn = (svc as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[method];
    if (typeof fn !== 'function') throw new Error(`unknown data method: ${method}`);
    return fn(...(Array.isArray(args) ? args : []));
  });
}
