import { and, desc, eq, notInArray, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { appState, games, scenes, scripts, sceneVersions } from './db/schema.js';

/**
 * The single source of truth for Vyper's persistence operations. Pure data layer —
 * no HTTP. The web server (Express, Postgres) and the desktop app (Electron IPC,
 * embedded PGlite) both build this against their own drizzle `db`, so CRUD + the
 * `updatedAt` stamping live in exactly one place. Works on any drizzle pg driver
 * (`node-postgres`, `pglite`) since they share the `pg-core` query API.
 */

const AUTO_KEEP = 25; // newest auto-snapshots retained per scene

/** Carries an HTTP-style status so the Express wrapper can map 404/400 correctly. */
export class ServiceError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ServiceError';
  }
}

/** Any drizzle Postgres-dialect database (node-postgres or pglite). */
export type DataDb = PgDatabase<any, any, any>;

interface GamePatch {
  name?: string;
  description?: string;
  activeSceneId?: string | null;
  settings?: Record<string, unknown>;
}
interface ScenePatch {
  name?: string;
  entities?: unknown[];
  gameCamera?: unknown;
  gridVisible?: boolean;
  orderIndex?: number;
}
interface VersionInput {
  kind?: string;
  label?: string;
  entities?: unknown[];
  gameCamera?: unknown;
  gridVisible?: boolean;
  scripts?: unknown[];
}

export function createDataService(db: DataDb) {
  const touchGame = (id: string) =>
    db.update(games).set({ updatedAt: new Date() }).where(eq(games.id, id));

  return {
    // ----- App state (singleton) -----
    async getApp() {
      const [row] = await db.select().from(appState).where(eq(appState.id, 'singleton'));
      return row ?? { id: 'singleton', lastGameId: null, data: {} };
    },
    async putApp(body: { lastGameId?: string | null; data?: Record<string, unknown> }) {
      const [row] = await db
        .update(appState)
        .set({ lastGameId: body?.lastGameId ?? null, data: body?.data ?? {}, updatedAt: new Date() })
        .where(eq(appState.id, 'singleton'))
        .returning();
      return row;
    },

    // ----- Games -----
    async listGames() {
      const rows = await db.select().from(games).orderBy(desc(games.updatedAt));
      const counts = await db
        .select({ gameId: scenes.gameId, n: sql<number>`count(*)::int` })
        .from(scenes)
        .groupBy(scenes.gameId);
      const byId = new Map(counts.map((c) => [c.gameId, c.n]));
      return rows.map((g) => ({ ...g, sceneCount: byId.get(g.id) ?? 0 }));
    },
    async getGame(id: string) {
      const [game] = await db.select().from(games).where(eq(games.id, id));
      if (!game) throw new ServiceError(404, 'game not found');
      const sceneList = await db
        .select({
          id: scenes.id,
          gameId: scenes.gameId,
          name: scenes.name,
          orderIndex: scenes.orderIndex,
          gridVisible: scenes.gridVisible,
          updatedAt: scenes.updatedAt,
        })
        .from(scenes)
        .where(eq(scenes.gameId, game.id))
        .orderBy(scenes.orderIndex);
      const scriptList = await db.select().from(scripts).where(eq(scripts.gameId, game.id));
      return { game, scenes: sceneList, scripts: scriptList };
    },
    async createGame(name?: string, description = '') {
      const nm = String(name ?? 'Untitled Game').slice(0, 120);
      const [game] = await db.insert(games).values({ name: nm, description: String(description ?? '') }).returning();
      const [scene] = await db
        .insert(scenes)
        .values({ gameId: game.id, name: 'Scene 1', orderIndex: 0 })
        .returning();
      const [updated] = await db
        .update(games)
        .set({ activeSceneId: scene.id })
        .where(eq(games.id, game.id))
        .returning();
      return { game: updated, scenes: [scene], scripts: [] as unknown[] };
    },
    async patchGame(id: string, patch: GamePatch) {
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (patch?.name !== undefined) set.name = String(patch.name).slice(0, 120);
      if (patch?.description !== undefined) set.description = String(patch.description);
      if (patch?.activeSceneId !== undefined) set.activeSceneId = patch.activeSceneId;
      if (patch?.settings !== undefined) set.settings = patch.settings;
      const [row] = await db.update(games).set(set).where(eq(games.id, id)).returning();
      if (!row) throw new ServiceError(404, 'game not found');
      return row;
    },
    async deleteGame(id: string) {
      await db.delete(games).where(eq(games.id, id)); // cascades scenes + scripts
    },
    async putScripts(gameId: string, incoming: Array<Record<string, unknown>>) {
      const list = Array.isArray(incoming) ? incoming : [];
      await db.transaction(async (tx) => {
        const ids = list.map((s) => String(s.id));
        if (ids.length) {
          await tx.delete(scripts).where(and(eq(scripts.gameId, gameId), notInArray(scripts.id, ids)));
        } else {
          await tx.delete(scripts).where(eq(scripts.gameId, gameId));
        }
        for (const s of list) {
          const values = {
            id: String(s.id),
            gameId,
            name: String(s.name ?? 'Behaviour'),
            mode: String(s.mode ?? 'nodes'),
            code: String(s.code ?? ''),
            codeDirty: Boolean(s.codeDirty),
            enabled: s.enabled === undefined ? true : Boolean(s.enabled),
            graph: (s.graph ?? {}) as Record<string, unknown>,
            updatedAt: new Date(),
          };
          await tx.insert(scripts).values(values).onConflictDoUpdate({
            target: scripts.id,
            set: {
              name: values.name,
              mode: values.mode,
              code: values.code,
              codeDirty: values.codeDirty,
              enabled: values.enabled,
              graph: values.graph,
              updatedAt: values.updatedAt,
            },
          });
        }
      });
      await touchGame(gameId);
      return { ok: true, count: list.length };
    },

    // ----- Scenes -----
    async getScene(id: string) {
      const [scene] = await db.select().from(scenes).where(eq(scenes.id, id));
      if (!scene) throw new ServiceError(404, 'scene not found');
      return scene;
    },
    async createScene(gameId: string, name?: string) {
      const [{ max }] = await db
        .select({ max: sql<number>`coalesce(max(${scenes.orderIndex}), -1)::int` })
        .from(scenes)
        .where(eq(scenes.gameId, gameId));
      const nm = String(name ?? `Scene ${(max ?? -1) + 2}`);
      const [scene] = await db
        .insert(scenes)
        .values({ gameId, name: nm, orderIndex: (max ?? -1) + 1, entities: [] })
        .returning();
      await touchGame(gameId);
      return scene;
    },
    async patchScene(id: string, patch: ScenePatch) {
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (patch?.name !== undefined) set.name = String(patch.name);
      if (patch?.entities !== undefined) set.entities = patch.entities;
      if (patch?.gameCamera !== undefined) set.gameCamera = patch.gameCamera;
      if (patch?.gridVisible !== undefined) set.gridVisible = Boolean(patch.gridVisible);
      if (patch?.orderIndex !== undefined) set.orderIndex = Number(patch.orderIndex);
      const [row] = await db.update(scenes).set(set).where(eq(scenes.id, id)).returning();
      if (!row) throw new ServiceError(404, 'scene not found');
      await touchGame(row.gameId);
      return row;
    },
    async deleteScene(id: string) {
      const [scene] = await db.select().from(scenes).where(eq(scenes.id, id));
      if (!scene) throw new ServiceError(404, 'scene not found');
      const siblings = await db.select().from(scenes).where(eq(scenes.gameId, scene.gameId));
      if (siblings.length <= 1) throw new ServiceError(400, 'a game must keep at least one scene');
      await db.delete(scenes).where(eq(scenes.id, scene.id));
      const [game] = await db.select().from(games).where(eq(games.id, scene.gameId));
      if (game?.activeSceneId === scene.id) {
        const next = siblings.find((s) => s.id !== scene.id)!;
        await db.update(games).set({ activeSceneId: next.id, updatedAt: new Date() }).where(eq(games.id, game.id));
      } else {
        await touchGame(scene.gameId);
      }
    },

    // ----- Scene versions (revert history) -----
    async createVersion(sceneId: string, body: VersionInput) {
      const [scene] = await db.select().from(scenes).where(eq(scenes.id, sceneId));
      if (!scene) throw new ServiceError(404, 'scene not found');
      const isManual = body?.kind === 'manual';
      const [row] = await db
        .insert(sceneVersions)
        .values({
          sceneId,
          gameId: scene.gameId,
          label: String(body?.label ?? ''),
          kind: isManual ? 'manual' : 'auto',
          entities: (body?.entities ?? scene.entities) as unknown[],
          gameCamera: (body?.gameCamera ?? {}) as Record<string, unknown>,
          gridVisible: body?.gridVisible === undefined ? true : Boolean(body.gridVisible),
          scripts: Array.isArray(body?.scripts) ? body.scripts : [],
        })
        .returning();
      if (!isManual) {
        await db.execute(sql`
          DELETE FROM scene_versions
          WHERE scene_id = ${sceneId} AND kind = 'auto' AND id NOT IN (
            SELECT id FROM scene_versions
            WHERE scene_id = ${sceneId} AND kind = 'auto'
            ORDER BY created_at DESC LIMIT ${AUTO_KEEP}
          )`);
      }
      return { id: row.id, kind: row.kind, label: row.label, createdAt: row.createdAt };
    },
    async listVersions(sceneId: string) {
      return db
        .select({
          id: sceneVersions.id,
          label: sceneVersions.label,
          kind: sceneVersions.kind,
          createdAt: sceneVersions.createdAt,
        })
        .from(sceneVersions)
        .where(eq(sceneVersions.sceneId, sceneId))
        .orderBy(desc(sceneVersions.createdAt))
        .limit(100);
    },
    async getVersion(id: string) {
      const [row] = await db.select().from(sceneVersions).where(eq(sceneVersions.id, id));
      if (!row) throw new ServiceError(404, 'version not found');
      return row;
    },
  };
}

export type DataService = ReturnType<typeof createDataService>;
