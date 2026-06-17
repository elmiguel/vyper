# Desktop app (Electron) — embedded DB + Postgres sync

Vyper ships from **one codebase** as both the web app and a standalone desktop app.
The desktop build runs the same React renderer inside Electron, stores data in an
**embedded database**, works fully offline, and **syncs with your Postgres** when it's
reachable (newest write wins).

## Architecture

```
                         ┌─────────────────────────── one source ──────────────────────────┐
 renderer (src/)         │  server/dataService.ts  ·  server/db/schema.ts  ·  bootstrap.ts  │
   useProjectStore        └──────────────────────────────────────────────────────────────────┘
        │ imports @/data            ▲                                   ▲
        ▼                           │ createDataService(pgDb)           │ createDataService(pgliteDb)
  src/data/index.ts ── isDesktop()? │                                   │
        ├── web  → httpApi ──fetch /api──► Express (server/) ──► Postgres
        └── desktop → desktopApi ──IPC──► Electron main (electron/) ──► PGlite (embedded)
                                                     │
                                                     └── sync engine ⇄ Postgres (when reachable)
```

- **One data service** — `server/dataService.ts` holds every persistence operation
  (CRUD + `updatedAt` stamping). It runs on any drizzle Postgres driver, so the web
  server (`node-postgres`) and the desktop app (`pglite`) reuse it verbatim.
- **Build-target bootstrap** — `src/buildEnv.ts#isDesktop()` checks for the
  `window.vyper` bridge the Electron preload injects. `src/data/index.ts` picks the
  HTTP provider (web) or the IPC provider (desktop). The renderer never imports
  `electron/`, so desktop/DB/sync code is never bundled into the web app.
- **Embedded DB** — `electron/db/embedded.ts` opens **PGlite** (Postgres compiled to
  WASM) under `app.getPath('userData')/vyper-db` and seeds it with the **same**
  `CREATE TABLE` SQL as the server (`server/db/bootstrap.ts`).
- **Renderer loading** — the built UI is served over a custom **`app://`** protocol
  (not `file://`), registered as a standard/secure scheme in `electron/main.ts`. That
  gives the renderer a real web origin where absolute asset paths resolve and `fetch()`
  works — required for Babylon's Havok physics WASM (`/HavokPhysics.wasm`, served with
  `Content-Type: application/wasm`).

## Offline-first sync (`electron/sync/`)

The app always reads/writes the embedded DB (fast, always available). A background
engine reconciles it with Postgres on launch and every 60s **when Postgres is
reachable** (`DATABASE_URL`):

- **`merge.ts`** (pure, unit-tested) decides what to copy each way:
  - `games` / `scenes` / `scripts` / `app_state` → **newest `updatedAt` wins** per row;
    rows present on only one side are copied over.
  - `scene_versions` are append-only → union by id.
- **`syncEngine.ts`** applies the plan in FK-safe order, mirroring **both** ways — so
  the embedded DB is always a complete offline copy ("port to embedded"), and edits
  made offline propagate back to Postgres on reconnect.

**Limitations:** deletes don't propagate (no tombstones yet — soft-delete is the
planned fix); sync assumes a shared wall clock (true for single-user / localhost).

## Develop & build

```bash
npm run dev:desktop     # standalone: vite build → bundle electron → launch Electron (loads dist/)
npm run dev:desktop:hot # optional UI hot reload: Vite dev server + Electron @ :5173
npm run build:desktop   # vite build → bundle electron → electron-builder package
npm run typecheck:electron
```

- `dev:desktop` is **self-contained**: Electron loads the built renderer from `dist/`
  with no dependency on the web dev server. Use this to run/test the desktop app.
- `dev:desktop:hot` is the convenience loop for *editing the UI* in the shell — it runs
  Vite and points Electron at `http://localhost:5173` (`electron/main.ts` retries until
  Vite is up). Either way, **data** is embedded + Postgres-sync, never the web API.
- On launch the console logs the data mode: *"Postgres reachable — synced …"* or
  *"Postgres not reachable — using the embedded database."*
- `build:electron` (esbuild) bundles `electron/main.ts` → `dist-electron/main.js`
  (ESM) and `electron/preload.ts` → `dist-electron/preload.cjs`. Electron + PGlite
  are external; PGlite's WASM is unpacked by electron-builder (`asarUnpack`).
- Packaged installers land in `release/` (dmg / nsis / AppImage).

## Verifying sync

1. `npm run dev:desktop` with the server/Postgres **off** → create games/scenes; data
   persists to the embedded DB across restarts.
2. Start Postgres (`DATABASE_URL` set) → on next launch the console logs
   `sync complete (embedded ↔ postgres)`; rows reconcile newest-wins both ways.
3. Edit the same game on web (Postgres) and desktop (embedded) offline; reconnect →
   the later edit wins.
