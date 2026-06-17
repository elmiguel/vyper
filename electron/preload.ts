import { contextBridge, ipcRenderer } from 'electron';

/**
 * Exposes a minimal, safe data bridge to the renderer (contextIsolation on). Its
 * presence is also how the renderer detects the desktop build (see src/buildEnv.ts).
 */
contextBridge.exposeInMainWorld('vyper', {
  invoke: (method: string, ...args: unknown[]) => ipcRenderer.invoke('vyper:invoke', method, args),
});
