import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  // Fail loud and early — the whole app depends on this.
  console.error(
    '\n[vyper] DATABASE_URL is not set. Create a .env file (see .env.example) pointing at your Postgres instance.\n',
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });
