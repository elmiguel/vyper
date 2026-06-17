/**
 * Pure conflict-resolution for offline-first sync. No DB access — given two row
 * sets (embedded + Postgres) it decides what to copy each way. This is the heart of
 * "newest data timestamp always wins" and is fully unit-tested (merge.test.ts).
 */

export type Row = Record<string, unknown>;

/** Rows to write to each side to bring them into agreement. */
export interface MergePlan<T> {
  toLocal: T[];
  toRemote: T[];
}

/**
 * Reconcile by a timestamp column: when a key exists on both sides the row with the
 * later timestamp wins and is pushed to the stale side; a key on only one side is
 * copied to the other. Equal timestamps are treated as already in sync.
 * Used for `app_state`, `games`, `scenes`, `scripts` (ts = `updatedAt`).
 */
export function mergeByTimestamp<T extends Row>(
  local: T[],
  remote: T[],
  opts: { key?: string; ts?: string } = {},
): MergePlan<T> {
  const key = opts.key ?? 'id';
  const ts = opts.ts ?? 'updatedAt';
  const toLocal: T[] = [];
  const toRemote: T[] = [];
  const remoteById = new Map(remote.map((r) => [String(r[key]), r]));
  const seen = new Set<string>();

  for (const l of local) {
    const id = String(l[key]);
    seen.add(id);
    const r = remoteById.get(id);
    if (!r) {
      toRemote.push(l); // only local has it
      continue;
    }
    const lt = toMillis(l[ts]);
    const rt = toMillis(r[ts]);
    if (lt > rt) toRemote.push(l);
    else if (rt > lt) toLocal.push(r);
    // equal → already in sync, copy nothing
  }
  for (const r of remote) {
    if (!seen.has(String(r[key]))) toLocal.push(r); // only remote has it
  }
  return { toLocal, toRemote };
}

/**
 * Append-only union by key (e.g. `scene_versions`, which are never updated, only
 * created): copy any rows missing on either side. No timestamp comparison needed.
 */
export function unionById<T extends Row>(local: T[], remote: T[], key = 'id'): MergePlan<T> {
  const localIds = new Set(local.map((r) => String(r[key])));
  const remoteIds = new Set(remote.map((r) => String(r[key])));
  return {
    toRemote: local.filter((r) => !remoteIds.has(String(r[key]))),
    toLocal: remote.filter((r) => !localIds.has(String(r[key]))),
  };
}

/** Coerce a timestamp value (Date | ISO string | epoch ms) to comparable millis. */
function toMillis(v: unknown): number {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}
