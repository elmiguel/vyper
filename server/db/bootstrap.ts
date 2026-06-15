import { pool } from './client.js';

/**
 * Idempotent schema creation, run on server startup so Vyper works against a
 * fresh Postgres with no manual migration step. Mirrors schema.ts. For managed
 * migrations later, use drizzle-kit (see drizzle.config.ts).
 */
const SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_state (
  id          text PRIMARY KEY DEFAULT 'singleton',
  last_game_id uuid,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS games (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner        text NOT NULL DEFAULT 'local',
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  active_scene_id uuid,
  settings     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scenes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id      uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name         text NOT NULL,
  order_index  integer NOT NULL DEFAULT 0,
  entities     jsonb NOT NULL DEFAULT '[]'::jsonb,
  game_camera  jsonb NOT NULL DEFAULT '{}'::jsonb,
  grid_visible boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scenes_game_id_idx ON scenes(game_id);

CREATE TABLE IF NOT EXISTS scripts (
  id          text PRIMARY KEY,
  game_id     uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name        text NOT NULL,
  mode        text NOT NULL DEFAULT 'nodes',
  code        text NOT NULL DEFAULT '',
  code_dirty  boolean NOT NULL DEFAULT false,
  enabled     boolean NOT NULL DEFAULT true,
  graph       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scripts_game_id_idx ON scripts(game_id);

CREATE TABLE IF NOT EXISTS scene_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id     uuid NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  game_id      uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  label        text NOT NULL DEFAULT '',
  kind         text NOT NULL DEFAULT 'auto',
  entities     jsonb NOT NULL DEFAULT '[]'::jsonb,
  game_camera  jsonb NOT NULL DEFAULT '{}'::jsonb,
  grid_visible boolean NOT NULL DEFAULT true,
  scripts      jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scene_versions_scene_idx ON scene_versions(scene_id, created_at DESC);

INSERT INTO app_state (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;
`;

export async function ensureSchema() {
  await pool.query(SQL);
}
