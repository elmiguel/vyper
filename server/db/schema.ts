import { pgTable, text, integer, boolean, jsonb, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Vyper's persistence model (single local user).
 *
 *   app_state ─ singleton row: global prefs + last opened game
 *   games ─────┐
 *              ├─ scenes  (entities stored as JSONB per scene)
 *              └─ scripts (behaviours; code + node graph as JSONB, game-scoped)
 *
 * Scene contents (the entity list) and node graphs are JSONB blobs — the editor
 * already serializes them to JSON, and they round-trip cleanly. Everything above
 * that (games / scenes / scripts) is relational and queryable.
 */

export const appState = pgTable('app_state', {
  id: text('id').primaryKey().default('singleton'),
  lastGameId: uuid('last_game_id'),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const games = pgTable('games', {
  id: uuid('id').primaryKey().defaultRandom(),
  owner: text('owner').notNull().default('local'),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  activeSceneId: uuid('active_scene_id'),
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const scenes = pgTable('scenes', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id')
    .notNull()
    .references(() => games.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  // Entity[] — the scene graph (meshes, lights, transforms, scriptIds, props).
  entities: jsonb('entities').$type<unknown[]>().notNull().default([]),
  // { position, rotation } for the play camera.
  gameCamera: jsonb('game_camera').$type<Record<string, unknown>>().notNull().default({}),
  gridVisible: boolean('grid_visible').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const scripts = pgTable('scripts', {
  // Text id: the editor's own (nanoid) script id, referenced by entity.scriptIds.
  id: text('id').primaryKey(),
  gameId: uuid('game_id')
    .notNull()
    .references(() => games.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  mode: text('mode').notNull().default('nodes'), // 'nodes' | 'code'
  code: text('code').notNull().default(''),
  codeDirty: boolean('code_dirty').notNull().default(false),
  enabled: boolean('enabled').notNull().default(true),
  // { nodes, edges } React Flow graph.
  graph: jsonb('graph').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Point-in-time snapshots of a scene (entities + camera + grid) plus the game's
 * scripts at that moment. Written periodically by autosave and on manual saves,
 * so a user can revert to a previous saved state even across sessions.
 */
export const sceneVersions = pgTable('scene_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sceneId: uuid('scene_id')
    .notNull()
    .references(() => scenes.id, { onDelete: 'cascade' }),
  gameId: uuid('game_id')
    .notNull()
    .references(() => games.id, { onDelete: 'cascade' }),
  label: text('label').notNull().default(''),
  kind: text('kind').notNull().default('auto'), // 'auto' | 'manual'
  entities: jsonb('entities').$type<unknown[]>().notNull().default([]),
  gameCamera: jsonb('game_camera').$type<Record<string, unknown>>().notNull().default({}),
  gridVisible: boolean('grid_visible').notNull().default(true),
  scripts: jsonb('scripts').$type<unknown[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type GameRow = typeof games.$inferSelect;
export type SceneRow = typeof scenes.$inferSelect;
export type ScriptRow = typeof scripts.$inferSelect;
export type SceneVersionRow = typeof sceneVersions.$inferSelect;
