import { Router, type Request, type Response, type NextFunction } from 'express';
import { and, desc, eq, notInArray, sql } from 'drizzle-orm';
import { db } from './db/client.js';
import { appState, games, scenes, scripts, sceneVersions } from './db/schema.js';

const AUTO_KEEP = 25; // newest auto-snapshots retained per scene

export const api = Router();

/** Wrap async handlers so rejections become 500s instead of hanging. */
const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const touchGame = (id: string) =>
  db.update(games).set({ updatedAt: new Date() }).where(eq(games.id, id));

// ---------- App state (singleton) ----------
api.get(
  '/app',
  h(async (_req, res) => {
    const [row] = await db.select().from(appState).where(eq(appState.id, 'singleton'));
    res.json(row ?? { id: 'singleton', lastGameId: null, data: {} });
  }),
);

api.put(
  '/app',
  h(async (req, res) => {
    const { lastGameId, data } = req.body ?? {};
    const [row] = await db
      .update(appState)
      .set({ lastGameId: lastGameId ?? null, data: data ?? {}, updatedAt: new Date() })
      .where(eq(appState.id, 'singleton'))
      .returning();
    res.json(row);
  }),
);

// ---------- Games ----------
api.get(
  '/games',
  h(async (_req, res) => {
    const rows = await db.select().from(games).orderBy(desc(games.updatedAt));
    const counts = await db
      .select({ gameId: scenes.gameId, n: sql<number>`count(*)::int` })
      .from(scenes)
      .groupBy(scenes.gameId);
    const byId = new Map(counts.map((c) => [c.gameId, c.n]));
    res.json(rows.map((g) => ({ ...g, sceneCount: byId.get(g.id) ?? 0 })));
  }),
);

// Full game payload: game + scene metadata (no entity blobs) + all scripts.
api.get(
  '/games/:id',
  h(async (req, res) => {
    const [game] = await db.select().from(games).where(eq(games.id, String(req.params.id)));
    if (!game) return res.status(404).json({ error: 'game not found' });
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
    res.json({ game, scenes: sceneList, scripts: scriptList });
  }),
);

// Create a game with one empty starter scene.
api.post(
  '/games',
  h(async (req, res) => {
    const name = String(req.body?.name ?? 'Untitled Game').slice(0, 120);
    const description = String(req.body?.description ?? '');
    const [game] = await db.insert(games).values({ name, description }).returning();
    const [scene] = await db
      .insert(scenes)
      .values({ gameId: game.id, name: 'Scene 1', orderIndex: 0 })
      .returning();
    const [updated] = await db
      .update(games)
      .set({ activeSceneId: scene.id })
      .where(eq(games.id, game.id))
      .returning();
    res.status(201).json({ game: updated, scenes: [scene], scripts: [] });
  }),
);

api.patch(
  '/games/:id',
  h(async (req, res) => {
    const { name, description, activeSceneId, settings } = req.body ?? {};
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) patch.name = String(name).slice(0, 120);
    if (description !== undefined) patch.description = String(description);
    if (activeSceneId !== undefined) patch.activeSceneId = activeSceneId;
    if (settings !== undefined) patch.settings = settings;
    const [row] = await db.update(games).set(patch).where(eq(games.id, String(req.params.id))).returning();
    if (!row) return res.status(404).json({ error: 'game not found' });
    res.json(row);
  }),
);

api.delete(
  '/games/:id',
  h(async (req, res) => {
    await db.delete(games).where(eq(games.id, String(req.params.id))); // cascades scenes + scripts
    res.status(204).end();
  }),
);

// Bulk replace a game's scripts (matches the editor's scripts record).
api.put(
  '/games/:id/scripts',
  h(async (req, res) => {
    const gameId = String(req.params.id);
    const incoming: Array<Record<string, unknown>> = Array.isArray(req.body?.scripts) ? req.body.scripts : [];
    await db.transaction(async (tx) => {
      const ids = incoming.map((s) => String(s.id));
      // Delete scripts that no longer exist client-side.
      if (ids.length) {
        await tx.delete(scripts).where(and(eq(scripts.gameId, gameId), notInArray(scripts.id, ids)));
      } else {
        await tx.delete(scripts).where(eq(scripts.gameId, gameId));
      }
      for (const s of incoming) {
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
        await tx
          .insert(scripts)
          .values(values)
          .onConflictDoUpdate({
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
    res.json({ ok: true, count: incoming.length });
  }),
);

// ---------- Scenes ----------
api.get(
  '/scenes/:id',
  h(async (req, res) => {
    const [scene] = await db.select().from(scenes).where(eq(scenes.id, String(req.params.id)));
    if (!scene) return res.status(404).json({ error: 'scene not found' });
    res.json(scene);
  }),
);

api.post(
  '/games/:id/scenes',
  h(async (req, res) => {
    const gameId = String(req.params.id);
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${scenes.orderIndex}), -1)::int` })
      .from(scenes)
      .where(eq(scenes.gameId, gameId));
    const name = String(req.body?.name ?? `Scene ${(max ?? -1) + 2}`);
    const [scene] = await db
      .insert(scenes)
      .values({ gameId, name, orderIndex: (max ?? -1) + 1, entities: req.body?.entities ?? [] })
      .returning();
    await touchGame(gameId);
    res.status(201).json(scene);
  }),
);

api.patch(
  '/scenes/:id',
  h(async (req, res) => {
    const { name, entities, gameCamera, gridVisible, orderIndex } = req.body ?? {};
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) patch.name = String(name);
    if (entities !== undefined) patch.entities = entities;
    if (gameCamera !== undefined) patch.gameCamera = gameCamera;
    if (gridVisible !== undefined) patch.gridVisible = Boolean(gridVisible);
    if (orderIndex !== undefined) patch.orderIndex = Number(orderIndex);
    const [row] = await db.update(scenes).set(patch).where(eq(scenes.id, String(req.params.id))).returning();
    if (!row) return res.status(404).json({ error: 'scene not found' });
    await touchGame(row.gameId);
    res.json(row);
  }),
);

api.delete(
  '/scenes/:id',
  h(async (req, res) => {
    const [scene] = await db.select().from(scenes).where(eq(scenes.id, String(req.params.id)));
    if (!scene) return res.status(404).json({ error: 'scene not found' });
    const siblings = await db.select().from(scenes).where(eq(scenes.gameId, scene.gameId));
    if (siblings.length <= 1) return res.status(400).json({ error: 'a game must keep at least one scene' });
    await db.delete(scenes).where(eq(scenes.id, scene.id));
    // If the deleted scene was active, pick another.
    const [game] = await db.select().from(games).where(eq(games.id, scene.gameId));
    if (game?.activeSceneId === scene.id) {
      const next = siblings.find((s) => s.id !== scene.id)!;
      await db.update(games).set({ activeSceneId: next.id, updatedAt: new Date() }).where(eq(games.id, game.id));
    } else {
      await touchGame(scene.gameId);
    }
    res.status(204).end();
  }),
);

// ---------- Scene versions (revert history) ----------
api.post(
  '/scenes/:id/versions',
  h(async (req, res) => {
    const sceneId = String(req.params.id);
    const [scene] = await db.select().from(scenes).where(eq(scenes.id, sceneId));
    if (!scene) return res.status(404).json({ error: 'scene not found' });
    const { label, kind, entities, gameCamera, gridVisible, scripts: scriptSnap } = req.body ?? {};
    const isManual = kind === 'manual';
    const [row] = await db
      .insert(sceneVersions)
      .values({
        sceneId,
        gameId: scene.gameId,
        label: String(label ?? ''),
        kind: isManual ? 'manual' : 'auto',
        entities: entities ?? scene.entities,
        gameCamera: gameCamera ?? {},
        gridVisible: gridVisible === undefined ? true : Boolean(gridVisible),
        scripts: Array.isArray(scriptSnap) ? scriptSnap : [],
      })
      .returning();
    // Keep only the newest N auto-snapshots per scene (manual ones are retained).
    if (!isManual) {
      await db.execute(sql`
        DELETE FROM scene_versions
        WHERE scene_id = ${sceneId} AND kind = 'auto' AND id NOT IN (
          SELECT id FROM scene_versions
          WHERE scene_id = ${sceneId} AND kind = 'auto'
          ORDER BY created_at DESC LIMIT ${AUTO_KEEP}
        )`);
    }
    res.status(201).json({ id: row.id, kind: row.kind, label: row.label, createdAt: row.createdAt });
  }),
);

api.get(
  '/scenes/:id/versions',
  h(async (req, res) => {
    const rows = await db
      .select({
        id: sceneVersions.id,
        label: sceneVersions.label,
        kind: sceneVersions.kind,
        createdAt: sceneVersions.createdAt,
      })
      .from(sceneVersions)
      .where(eq(sceneVersions.sceneId, String(req.params.id)))
      .orderBy(desc(sceneVersions.createdAt))
      .limit(100);
    res.json(rows);
  }),
);

api.get(
  '/versions/:id',
  h(async (req, res) => {
    const [row] = await db.select().from(sceneVersions).where(eq(sceneVersions.id, String(req.params.id)));
    if (!row) return res.status(404).json({ error: 'version not found' });
    res.json(row);
  }),
);
