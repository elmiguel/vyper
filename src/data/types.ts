import type { api as httpApi } from '@/api/client';

/**
 * The data-access contract shared by the web (HTTP) and desktop (IPC) providers.
 * Derived from the HTTP client so the two implementations can never drift.
 */
export type DataApi = typeof httpApi;
