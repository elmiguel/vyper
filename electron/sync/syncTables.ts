import { getTableColumns, sql, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { DataDb } from '../../server/dataService.js';
import type { Row } from './merge.js';

/**
 * Generic, table-agnostic read/upsert used by the sync engine. Works on any drizzle
 * Postgres-dialect db (embedded PGlite or remote Postgres) since both share the
 * `pg-core` query API. Kept narrow and `any`-cast at the drizzle boundary because
 * the engine treats every table uniformly (full-row mirror, PK-conflict overwrite).
 */

/** Read every row (all columns) of a table for reconciliation. */
export function selectAll(db: DataDb, table: PgTable): Promise<Row[]> {
  return db.select().from(table as never) as unknown as Promise<Row[]>;
}

/** Upsert full rows; on primary-key conflict, overwrite every column from the incoming row. */
export async function upsertRows(db: DataDb, table: PgTable, pk: PgColumn, rows: Row[]): Promise<void> {
  if (!rows.length) return;
  const set: Record<string, SQL> = {};
  for (const [field, col] of Object.entries(getTableColumns(table))) {
    set[field] = sql.raw(`excluded.${(col as PgColumn).name}`);
  }
  const insert = (db as unknown as { insert: (t: PgTable) => any }).insert(table);
  await insert.values(rows).onConflictDoUpdate({ target: pk, set });
}
