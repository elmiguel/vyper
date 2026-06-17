import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from './db/client.js';
import { createDataService, ServiceError } from './dataService.js';

/**
 * HTTP surface for the web app — thin Express wrappers over the shared data
 * service (see dataService.ts). All persistence logic lives in the service so the
 * desktop app can reuse it verbatim over IPC.
 */
const svc = createDataService(db);

export const api = Router();

/** Run an async handler; map ServiceError → its status, anything else → 500. */
const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch((err: unknown) => {
      if (err instanceof ServiceError) return res.status(err.status).json({ error: err.message });
      next(err);
    });

// App state
api.get('/app', h(async (_req, res) => res.json(await svc.getApp())));
api.put('/app', h(async (req, res) => res.json(await svc.putApp(req.body ?? {}))));

// Games
api.get('/games', h(async (_req, res) => res.json(await svc.listGames())));
api.get('/games/:id', h(async (req, res) => res.json(await svc.getGame(String(req.params.id)))));
api.post('/games', h(async (req, res) => res.status(201).json(await svc.createGame(req.body?.name, req.body?.description))));
api.patch('/games/:id', h(async (req, res) => res.json(await svc.patchGame(String(req.params.id), req.body ?? {}))));
api.delete('/games/:id', h(async (req, res) => {
  await svc.deleteGame(String(req.params.id));
  res.status(204).end();
}));
api.put('/games/:id/scripts', h(async (req, res) => res.json(await svc.putScripts(String(req.params.id), req.body?.scripts))));

// Scenes
api.get('/scenes/:id', h(async (req, res) => res.json(await svc.getScene(String(req.params.id)))));
api.post('/games/:id/scenes', h(async (req, res) => res.status(201).json(await svc.createScene(String(req.params.id), req.body?.name))));
api.patch('/scenes/:id', h(async (req, res) => res.json(await svc.patchScene(String(req.params.id), req.body ?? {}))));
api.delete('/scenes/:id', h(async (req, res) => {
  await svc.deleteScene(String(req.params.id));
  res.status(204).end();
}));

// Scene versions (revert history)
api.post('/scenes/:id/versions', h(async (req, res) => res.status(201).json(await svc.createVersion(String(req.params.id), req.body ?? {}))));
api.get('/scenes/:id/versions', h(async (req, res) => res.json(await svc.listVersions(String(req.params.id)))));
api.get('/versions/:id', h(async (req, res) => res.json(await svc.getVersion(String(req.params.id)))));
