import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { DataDb } from '../../server/dataService.js';
import type { Embedded } from '../db/embedded.js';
import { connectPostgres } from './postgres.js';
import { mergeByTimestamp, unionById } from './merge.js';
import { selectAll, upsertRows } from './syncTables.js';
import { appState, games, scenes, scripts, sceneVersions } from '../../server/db/schema.js';

/**
 * Offline-first sync. The app always reads/writes the embedded DB; this engine
 * reconciles it with the user's Postgres in the background — on launch and on an
 * interval — whenever Postgres is reachable. Per row, the later `updatedAt` wins,
 * and the result is mirrored BOTH ways, so the embedded DB is a complete offline
 * copy ("port to embedded") and offline edits propagate back on reconnect.
 *
 * Limitation: deletes don't propagate (no tombstones) — a soft-delete column is the
 * future fix. Assumes a shared wall clock (true for single-user / localhost Postgres).
 */
const SYNC_INTERVAL_MS = 60_000;

/** Start background sync; returns a stop function. */
export function startSync(embedded: Embedded, databaseUrl: string | undefined): () => void {
  let stopped = false;
  let wasReachable: boolean | null = null;
  const tick = async () => {
    if (stopped) return;
    try {
      const synced = await runOnce(embedded, databaseUrl);
      // Log only on a state change so the console isn't spammed every interval.
      if (synced !== wasReachable) {
        console.log(
          synced
            ? '[vyper] Postgres reachable — synced embedded ↔ server (newest wins).'
            : '[vyper] Postgres not reachable — using the embedded database.',
        );
        wasReachable = synced;
      }
    } catch (err) {
      console.error('[vyper] sync error:', err);
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), SYNC_INTERVAL_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/** One reconciliation pass. Returns false if Postgres was unreachable (stay embedded). */
export async function runOnce(embedded: Embedded, databaseUrl: string | undefined): Promise<boolean> {
  const remote = await connectPostgres(databaseUrl);
  if (!remote) return false;
  const local: DataDb = embedded.db;
  const rdb: DataDb = remote.db;
  try {
    // FK-safe order so mirrored inserts never violate references.
    await reconcileByTs(local, rdb, games, games.id);
    await reconcileByTs(local, rdb, scenes, scenes.id);
    await reconcileByTs(local, rdb, scripts, scripts.id);
    await reconcileUnion(local, rdb, sceneVersions, sceneVersions.id);
    await reconcileByTs(local, rdb, appState, appState.id);
    return true;
  } finally {
    await remote.dispose();
  }
}

async function reconcileByTs(local: DataDb, remote: DataDb, table: PgTable, pk: PgColumn): Promise<void> {
  const [l, r] = await Promise.all([selectAll(local, table), selectAll(remote, table)]);
  const { toLocal, toRemote } = mergeByTimestamp(l, r);
  await upsertRows(local, table, pk, toLocal);
  await upsertRows(remote, table, pk, toRemote);
}

async function reconcileUnion(local: DataDb, remote: DataDb, table: PgTable, pk: PgColumn): Promise<void> {
  const [l, r] = await Promise.all([selectAll(local, table), selectAll(remote, table)]);
  const { toLocal, toRemote } = unionById(l, r);
  await upsertRows(local, table, pk, toLocal);
  await upsertRows(remote, table, pk, toRemote);
}
