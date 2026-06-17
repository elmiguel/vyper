/**
 * Idempotent schema creation shared by the web server (Postgres) and the desktop
 * embedded DB (PGlite). The caller passes an `exec` that runs a SQL string, so the
 * SAME `CREATE TABLE IF NOT EXISTS` definitions seed both. Mirrors schema.ts. For
 * managed migrations later, use drizzle-kit (see drizzle.config.ts).
 */

const TABLES_SQL = `
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

/**
 * Create all tables/indexes if missing. `exec` runs one SQL string (e.g.
 * `(sql) => pool.query(sql)` on the server, `(sql) => pglite.exec(sql)` on desktop).
 */
export async function ensureSchema(exec: (sql: string) => Promise<unknown>): Promise<void> {
  // pgcrypto backfills gen_random_uuid() on older Postgres. It's core on PG13+ and
  // on PGlite (PG15), so a missing/unavailable extension here is non-fatal.
  try {
    await exec('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
  } catch {
    /* core gen_random_uuid() — extension not required */
  }
  await exec(TABLES_SQL);
}
