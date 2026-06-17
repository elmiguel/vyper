import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../server/db/schema.js';

/**
 * Best-effort connection to the user's Postgres for sync. Resolves a drizzle db
 * (+ disposer) when reachable, or null when not — the desktop app then just keeps
 * using its embedded DB. A short connect timeout keeps startup snappy when offline.
 */
export interface RemoteDb {
  db: NodePgDatabase<typeof schema>;
  dispose: () => Promise<void>;
}

export async function connectPostgres(
  url: string | undefined,
  timeoutMs = 2500,
): Promise<RemoteDb | null> {
  if (!url) return null;
  const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: timeoutMs, max: 2 });
  try {
    await pool.query('select 1');
    return { db: drizzle(pool, { schema }), dispose: () => pool.end() };
  } catch {
    await pool.end().catch(() => {});
    return null;
  }
}
