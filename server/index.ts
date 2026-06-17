import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { api } from './routes.js';
import { createAssetUploadRouter } from './assetUploads.js';
import { ensureSchema } from './db/bootstrap.js';
import { pool } from './db/client.js';

const PORT = Number(process.env.PORT ?? 8787);

async function main() {
  await ensureSchema((sql) => pool.query(sql));
  console.log('[vyper] database schema ready');

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '25mb' })); // scenes/graphs can be large

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Runtime asset uploads: stored on disk, served statically at /uploads, listed
  // + created under /api/assets. Mounted before the main /api router.
  const assets = createAssetUploadRouter();
  app.use('/uploads', express.static(assets.uploadDir));
  app.use('/api/assets', assets.router);

  app.use('/api', api);

  // Central error handler — keeps the process alive on a bad request.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[vyper] API error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'internal error' });
  });

  app.listen(PORT, () => console.log(`[vyper] API listening on http://localhost:${PORT}`));
}

main().catch((err) => {
  console.error('[vyper] failed to start:', err);
  process.exit(1);
});
