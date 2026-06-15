import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// For managed migrations: `npx drizzle-kit generate` then `npx drizzle-kit migrate`.
// (The server also auto-creates the schema on boot via ensureSchema().)
export default defineConfig({
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
