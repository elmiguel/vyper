import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from '../../server/db/schema.js';
import { ensureSchema } from '../../server/db/bootstrap.js';

/**
 * The desktop app's embedded database: PGlite (Postgres compiled to WASM) persisted
 * to a folder on disk. Because it speaks the same Postgres dialect as the server's
 * Postgres, it reuses the EXACT drizzle schema + bootstrap SQL + data service —
 * genuinely one source for web and desktop.
 */
export interface Embedded {
  pglite: PGlite;
  db: PgliteDatabase<typeof schema>;
}

/** Open (or create) the embedded DB at `dataDir` and ensure the schema exists. */
export async function openEmbedded(dataDir: string): Promise<Embedded> {
  const pglite = new PGlite(dataDir);
  await pglite.waitReady;
  await ensureSchema((sql) => pglite.exec(sql));
  const db = drizzle(pglite, { schema });
  return { pglite, db };
}
