/**
 * Cache a store instance on `globalThis` so Vite HMR re-evaluating its module reuses the same
 * instance instead of minting a duplicate. Without this, a hot update (e.g. after editing a
 * component that imports the store) can re-run the store module, leaving different parts of the
 * app bound to different store copies — state set on one isn't seen by the other (a classic
 * "works after a full restart, breaks after a save/pull" bug). In production each module
 * evaluates once, so this is just an identity passthrough.
 */
export function hmrSingleton<T>(key: string, factory: () => T): T {
  const g = globalThis as unknown as Record<string, unknown>;
  const cacheKey = `__vyper_store_${key}`;
  return (g[cacheKey] ??= factory()) as T;
}
