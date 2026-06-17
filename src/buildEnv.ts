/**
 * Build-target detection for the renderer. The Electron preload injects a
 * `window.vyper` bridge; its presence is how we know we're running inside the
 * desktop shell and should talk to the embedded DB over IPC rather than the HTTP
 * API. Web builds never see it. This is the seam the data layer code-splits on
 * (see src/data/index.ts) — desktop-only code is reached only when isDesktop().
 */

/** IPC bridge exposed by the Electron preload (electron/preload.ts). */
export interface VyperBridge {
  invoke<T = unknown>(method: string, ...args: unknown[]): Promise<T>;
}

declare global {
  interface Window {
    vyper?: VyperBridge;
  }
}

/** True when running inside the Electron desktop shell. */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.vyper;
}
